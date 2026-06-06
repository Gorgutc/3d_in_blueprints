import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "backend" / "tests" / "fixtures"
sys.path.insert(0, str(ROOT / "backend" / "src"))

from blueprints_backend import standards as standards_module


class BackendCliTests(unittest.TestCase):
    def test_minimal_job_writes_deterministic_outputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            shutil.copyfile(FIXTURES / "minimal_job.json", job_dir / "job.json")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                (FIXTURES / "golden_minimal.svg").read_text(encoding="utf-8"),
                (job_dir / "sheet.svg").read_text(encoding="utf-8"),
            )
            self.assertEqual(
                {
                    "errors": [],
                    "outputs": {
                        "diagnostics": "diagnostics.json",
                        "drawing_ir": "drawing_ir.json",
                        "svg": "sheet.svg",
                    },
                    "schema_version": "1.0",
                    "status": "ok",
                    "warnings": [],
                },
                json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8")),
            )

            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual("1.0", drawing_ir["schema_version"])
            self.assertEqual("minimal-line", drawing_ir["source_job_id"])
            self.assertEqual("mm", drawing_ir["units"])
            self.assertEqual(["hidden", "visible"], [layer["id"] for layer in drawing_ir["layers"]])
            self.assertEqual(["edge-left", "edge-right"], [
                entity["id"]
                for entity in drawing_ir["views"][0]["entities"]
            ])

    def test_missing_job_file_returns_diagnostics_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            diagnostics_path = job_dir / "diagnostics.json"
            self.assertTrue(diagnostics_path.exists(), result.stderr)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "missing_job",
                            "message": "job.json was not found in the job folder.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads(diagnostics_path.read_text(encoding="utf-8")),
            )

    def test_top_level_job_array_returns_diagnostics_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            (job_dir / "job.json").write_text("[]", encoding="utf-8")

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            diagnostics_path = job_dir / "diagnostics.json"
            self.assertTrue(diagnostics_path.exists(), result.stderr)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "invalid_job",
                            "message": "job.json must be a JSON object.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads(diagnostics_path.read_text(encoding="utf-8")),
            )

    def test_non_finite_number_returns_diagnostics_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = (FIXTURES / "minimal_job.json").read_text(encoding="utf-8")
            (job_dir / "job.json").write_text(job.replace('"width_mm": 210', '"width_mm": NaN'), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "invalid_json",
                            "message": "job.json contains non-finite number NaN.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8")),
            )

    def test_gost_non_a4_portrait_dimensions_returns_diagnostics_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "gost_job.json").read_text(encoding="utf-8"))
            job["sheet"]["width_mm"] = 297
            job["sheet"]["height_mm"] = 210
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "invalid_sheet",
                            "message": "GOST v1 supports A4 portrait sheets of 210x297 mm only.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8")),
            )

    def test_unsupported_entity_is_reported_as_warning_and_skipped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "minimal_job.json").read_text(encoding="utf-8"))
            job["views"][0]["entities"].append(
                {
                    "id": "arc-future",
                    "type": "arc",
                    "layer": "visible",
                    "center_mm": [25, 25],
                    "radius_mm": 10,
                }
            )
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual(
                [
                    {
                        "code": "unsupported_entity",
                        "entity_id": "arc-future",
                        "message": "Entity arc-future type arc is not supported in I1 and was skipped.",
                        "view_id": "front",
                    }
                ],
                diagnostics["warnings"],
            )
            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual(["edge-left", "edge-right"], [
                entity["id"]
                for entity in drawing_ir["views"][0]["entities"]
            ])

    def test_scene_snapshot_job_without_views_returns_placeholder_warning(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            (job_dir / "scene_snapshot.json").write_text(
                json.dumps({"schema_version": "1.0", "objects": []}),
                encoding="utf-8",
            )
            (job_dir / "scene.obj").write_text("# smoke asset\n", encoding="utf-8")
            (job_dir / "job.json").write_text(
                json.dumps({
                    "job_id": "scene-bridge",
                    "schema_version": "1.0",
                    "sheet": {
                        "format": "A4",
                        "height_mm": 297,
                        "width_mm": 210,
                    },
                    "source": {
                        "assets": {
                            "scene": "scene.obj",
                        },
                        "scene_snapshot": "scene_snapshot.json",
                    },
                }),
                encoding="utf-8",
            )

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual(
                [
                    {
                        "code": "projection_pending",
                        "message": "SceneSnapshot projection is not implemented in I2; backend emitted an empty placeholder view.",
                        "source": "scene_snapshot.json",
                    }
                ],
                diagnostics["warnings"],
            )
            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual([], drawing_ir["views"][0]["entities"])

    def test_gost_job_writes_frame_title_block_and_view_layers(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            shutil.copyfile(FIXTURES / "gost_job.json", job_dir / "job.json")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                (FIXTURES / "golden_gost_a4.svg").read_text(encoding="utf-8"),
                (job_dir / "sheet.svg").read_text(encoding="utf-8"),
            )
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual([], diagnostics["warnings"])

            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual("GOST", drawing_ir["sheet"]["standard"])
            self.assertEqual(
                {
                    "height_mm": 232,
                    "width_mm": 185,
                    "x_mm": 20,
                    "y_mm": 5,
                },
                drawing_ir["sheet"]["drawing_area_mm"],
            )
            self.assertEqual(
                ["frame", "hidden", "text", "thin", "visible"],
                [layer["id"] for layer in drawing_ir["layers"]],
            )
            self.assertEqual(
                ["gost-frame", "gost-title-block", "gost-title-row-1"],
                [element["id"] for element in drawing_ir["sheet_elements"][:3]],
            )

    def test_dimensions_job_writes_basic_dimension_annotations(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            shutil.copyfile(FIXTURES / "dimensions_job.json", job_dir / "job.json")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                (FIXTURES / "golden_dimensions_a4.svg").read_text(encoding="utf-8"),
                (job_dir / "sheet.svg").read_text(encoding="utf-8"),
            )
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual([], diagnostics["warnings"])

            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual(
                ["dimension", "frame", "hidden", "text", "thin", "visible"],
                [layer["id"] for layer in drawing_ir["layers"]],
            )
            self.assertEqual(
                ["linear", "diameter", "radius", "hole", "center_distance"],
                [dimension["type"] for dimension in drawing_ir["views"][0]["dimensions"]],
            )

    def test_unsupported_dimension_is_reported_as_warning_and_skipped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            job["views"][0]["dimensions"].append({
                "id": "dim-angle-future",
                "type": "angular",
            })
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual(
                [
                    {
                        "code": "unsupported_dimension",
                        "dimension_id": "dim-angle-future",
                        "message": "Dimension dim-angle-future type angular is not supported in I4 and was skipped.",
                        "view_id": "front",
                    }
                ],
                diagnostics["warnings"],
            )
            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual(
                ["dim-width", "dim-hole-dia", "dim-left-radius", "dim-hole-note", "dim-hole-centers"],
                [dimension["id"] for dimension in drawing_ir["views"][0]["dimensions"]],
            )

    def test_dimension_diameter_and_hole_leaders_follow_view_scale(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            job["views"][0]["scale"] = 2
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            sheet_svg = (job_dir / "sheet.svg").read_text(encoding="utf-8")
            self.assertIn(
                '<line id="dim-hole-dia-leader" x1="95" y1="75" x2="112" y2="70"',
                sheet_svg,
            )
            self.assertIn(
                '<line id="dim-hole-note-leader" x1="125" y1="75" x2="140" y2="70"',
                sheet_svg,
            )

    def test_duplicate_view_ids_return_diagnostics_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            duplicate_view = json.loads(json.dumps(job["views"][0]))
            duplicate_view["dimensions"] = [
                {
                    "id": "dim-duplicate-view",
                    "type": "linear",
                    "start_mm": [0, 0],
                    "end_mm": [10, 0],
                }
            ]
            job["views"].append(duplicate_view)
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "invalid_view",
                            "message": "view.id values must be unique.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8")),
            )

    def test_duplicate_dimension_ids_return_diagnostics_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            duplicate_dimension = json.loads(json.dumps(job["views"][0]["dimensions"][0]))
            duplicate_dimension["type"] = "linear"
            duplicate_dimension["start_mm"] = [0, 10]
            duplicate_dimension["end_mm"] = [10, 10]
            job["views"][0]["dimensions"].append(duplicate_dimension)
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "invalid_dimension",
                            "message": "dimension.id values must be unique within a view.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8")),
            )

    def test_non_standards_job_does_not_load_standards_catalog(self):
        original_load_catalog = standards_module.load_catalog

        def fail_if_loaded():
            raise AssertionError("standards catalog should not be loaded")

        standards_module.load_catalog = fail_if_loaded
        try:
            self.assertEqual(
                (
                    {
                        "fastener_matches": [],
                        "sources": [],
                    },
                    [],
                ),
                standards_module.match_job({"job_id": "no-standards"}),
            )
        finally:
            standards_module.load_catalog = original_load_catalog

    def test_standards_job_reports_fastener_matches_and_source_license(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            shutil.copyfile(FIXTURES / "standards_job.json", job_dir / "job.json")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                (FIXTURES / "golden_dimensions_a4.svg")
                .read_text(encoding="utf-8")
                .replace("dimensioned-bracket", "standards-fastener-bracket")
                .replace("Dimensioned Bracket", "Standards Fastener Bracket")
                .replace("DIM-001", "STD-001"),
                (job_dir / "sheet.svg").read_text(encoding="utf-8"),
            )
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual([], diagnostics["warnings"])
            self.assertEqual(
                [
                    {
                        "authority": "non_normative",
                        "description": "Project-authored starter fastener metadata for I5 matcher tests; no third-party standards table is copied.",
                        "id": "project-authored-metric-fasteners-v1",
                        "license": "Project-authored; no third-party license dependency.",
                    }
                ],
                diagnostics["standards"]["sources"],
            )
            self.assertEqual(
                ["metric-bolt-m8", "metric-nut-m8", "metric-washer-m8"],
                [
                    match["entry"]["id"]
                    for match in diagnostics["standards"]["fastener_matches"]
                ],
            )

            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual(
                ["bolt", "nut", "washer"],
                [
                    match["entry"]["family"]
                    for match in drawing_ir["standards"]["fastener_matches"]
                ],
            )
            self.assertEqual(
                ["match-m8-bolt", "match-m8-nut", "match-m8-washer"],
                [
                    match["request_id"]
                    for match in drawing_ir["standards"]["fastener_matches"]
                ],
            )

    def test_null_standards_is_treated_as_omitted(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            job["standards"] = None
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertNotIn("standards", diagnostics)

    def test_unsupported_standard_family_is_reported_as_warning_and_skipped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            job["standards"] = {
                "fastener_matches": [
                    {
                        "id": "match-bearing-m8",
                        "dimension_id": "dim-hole-note",
                        "family": "bearing",
                        "nominal_diameter_mm": 8,
                        "view_id": "front",
                    }
                ]
            }
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual(
                [
                    {
                        "code": "unsupported_standard_family",
                        "family": "bearing",
                        "message": "Fastener family bearing is not supported in I5 and was skipped.",
                        "standard_match_id": "match-bearing-m8",
                    }
                ],
                diagnostics["warnings"],
            )
            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual([], drawing_ir["standards"]["fastener_matches"])

    def test_standard_match_not_found_is_reported_as_warning(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            job["standards"] = {
                "fastener_matches": [
                    {
                        "id": "match-bolt-m7",
                        "dimension_id": "dim-hole-note",
                        "family": "bolt",
                        "nominal_diameter_mm": 7,
                        "view_id": "front",
                    }
                ]
            }
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual(
                [
                    {
                        "code": "standard_match_not_found",
                        "family": "bolt",
                        "message": "No I5 standards DB fastener matched family bolt with nominal diameter 7 mm.",
                        "nominal_diameter_mm": 7,
                        "standard_match_id": "match-bolt-m7",
                    }
                ],
                diagnostics["warnings"],
            )
            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual([], drawing_ir["standards"]["fastener_matches"])

    def test_standard_match_referencing_unsupported_dimension_is_skipped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
            job["views"][0]["dimensions"].append({
                "id": "dim-angle-future",
                "type": "angular",
            })
            job["standards"] = {
                "fastener_matches": [
                    {
                        "id": "match-unsupported-dimension",
                        "dimension_id": "dim-angle-future",
                        "family": "bolt",
                        "nominal_diameter_mm": 8,
                        "view_id": "front",
                    }
                ]
            }
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual(
                ["unsupported_dimension", "standard_reference_not_found"],
                [
                    warning["code"]
                    for warning in diagnostics["warnings"]
                ],
            )
            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual([], drawing_ir["standards"]["fastener_matches"])

    def test_duplicate_standard_match_ids_return_diagnostics_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "standards_job.json").read_text(encoding="utf-8"))
            duplicate_request = json.loads(json.dumps(job["standards"]["fastener_matches"][0]))
            duplicate_request["family"] = "nut"
            job["standards"]["fastener_matches"].append(duplicate_request)
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "invalid_standards",
                            "message": "standards.fastener_matches.id values must be unique.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8")),
            )

    def test_image_assist_job_writes_relative_overlay_svg(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            shutil.copyfile(FIXTURES / "image_assist_job.json", job_dir / "job.json")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                (FIXTURES / "golden_image_assist_overlay.svg").read_text(encoding="utf-8"),
                (job_dir / "assist_overlay.svg").read_text(encoding="utf-8"),
            )
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual([], diagnostics["warnings"])
            self.assertEqual(
                {
                    "diagnostics": "diagnostics.json",
                    "drawing_ir": "drawing_ir.json",
                    "image_assist_overlay": "assist_overlay.svg",
                    "svg": "sheet.svg",
                },
                diagnostics["outputs"],
            )

            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual("assistive", drawing_ir["image_assist"]["mode"])
            self.assertEqual("relative", drawing_ir["image_assist"]["units"])
            self.assertEqual(
                ["outer-contour", "hole-circle-hint", "width-ratio"],
                [
                    overlay["id"]
                    for overlay in drawing_ir["image_assist"]["overlays"]
                ],
            )

    def test_image_assist_rejects_absolute_dimensions_without_scale(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "image_assist_job.json").read_text(encoding="utf-8"))
            job["image_assist"]["overlays"] = [
                {
                    "end_mm": [10, 0],
                    "id": "absolute-width",
                    "label": "10 mm",
                    "start_mm": [0, 0],
                    "type": "relative_dimension",
                }
            ]
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(
                {
                    "errors": [
                        {
                            "code": "invalid_image_assist",
                            "message": "image_assist overlay absolute coordinates require scale.reference_mm_per_unit.",
                        }
                    ],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "error",
                    "warnings": [],
                },
                json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8")),
            )

    def test_unsupported_image_assist_overlay_is_reported_as_warning_and_skipped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            job = json.loads((FIXTURES / "image_assist_job.json").read_text(encoding="utf-8"))
            job["image_assist"]["overlays"].append({
                "id": "texture-map-future",
                "points_mm": [[0, 0], [10, 0]],
                "type": "texture_map",
            })
            (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")

            result = run_backend(job_dir)

            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("ok", diagnostics["status"])
            self.assertEqual(
                [
                    {
                        "code": "unsupported_image_assist_overlay",
                        "image_assist_overlay_id": "texture-map-future",
                        "message": "Image assist overlay texture-map-future type texture_map is not supported in I6 and was skipped.",
                    }
                ],
                diagnostics["warnings"],
            )
            drawing_ir = json.loads((job_dir / "drawing_ir.json").read_text(encoding="utf-8"))
            self.assertEqual(
                ["outer-contour", "hole-circle-hint", "width-ratio"],
                [
                    overlay["id"]
                    for overlay in drawing_ir["image_assist"]["overlays"]
                ],
            )


def run_backend(job_dir):
    env = os.environ.copy()
    src = str(ROOT / "backend" / "src")
    env["PYTHONPATH"] = src + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    return subprocess.run(
        [sys.executable, "-m", "blueprints_backend", str(job_dir)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


if __name__ == "__main__":
    unittest.main()
