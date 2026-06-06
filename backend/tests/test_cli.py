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
