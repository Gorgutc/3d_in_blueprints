import copy
import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as element_tree
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from blueprints_backend import cli as cli_module
from blueprints_backend import image_assist
from blueprints_backend import job as job_module


def scene_job(scene_snapshot="inputs/scene.json", scene_asset="assets/scene.obj"):
    return {
        "job_id": "scene-contract",
        "schema_version": "1.0",
        "sheet": {
            "format": "A4",
            "height_mm": 297,
            "width_mm": 210,
        },
        "source": {
            "assets": {
                "scene": scene_asset,
            },
            "scene_snapshot": scene_snapshot,
        },
    }


def view_job():
    return {
        "job_id": "view-contract",
        "schema_version": "1.0",
        "sheet": {
            "format": "A4",
            "height_mm": 297,
            "width_mm": 210,
        },
        "views": [
            {
                "entities": [
                    {
                        "end_mm": [10, 0],
                        "id": "edge-shared",
                        "layer": "visible",
                        "start_mm": [0, 0],
                        "type": "line",
                    }
                ],
                "id": "front",
                "label": "Front",
                "origin_mm": [20, 20],
                "scale": 1,
            }
        ],
    }


def write_source_files(job_dir, job=None, snapshot_bytes=None, asset_bytes=b"opaque scene asset"):
    payload = scene_job() if job is None else job
    snapshot_path = job_dir.joinpath(*payload["source"]["scene_snapshot"].split("/"))
    asset_path = job_dir.joinpath(*payload["source"]["assets"]["scene"].split("/"))
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    asset_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_bytes(
        b'{"schema_version":"1.0"}' if snapshot_bytes is None else snapshot_bytes
    )
    asset_path.write_bytes(asset_bytes)
    return payload


def set_source_path(payload, field, value):
    if field == "scene_snapshot":
        payload["source"]["scene_snapshot"] = value
    else:
        payload["source"]["assets"]["scene"] = value


def source_path(payload, field):
    if field == "scene_snapshot":
        return payload["source"]["scene_snapshot"]
    return payload["source"]["assets"]["scene"]


class PortableSourcePathContractTests(unittest.TestCase):
    def assert_job_error(self, expected_code, payload, job_dir):
        with self.assertRaises(job_module.JobError) as raised:
            job_module.validate_job(payload, job_dir)
        self.assertEqual(expected_code, raised.exception.code)

    def test_nested_posix_relative_source_paths_are_valid(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            payload = scene_job(
                scene_snapshot="inputs/snapshots/scene.json",
                scene_asset="assets/meshes/scene.glb",
            )
            write_source_files(job_dir, payload, asset_bytes=b"not parsed as GLB")

            job_module.validate_job(payload, job_dir)

    def test_nonportable_or_nonnormalized_source_paths_are_rejected(self):
        invalid_paths = [
            "",
            " ",
            "/absolute/scene.json",
            "C:/absolute/scene.json",
            "C:\\absolute\\scene.json",
            "C:drive-relative\\scene.json",
            "\\\\server\\share\\scene.json",
            "../scene.json",
            "nested/../../scene.json",
            "nested\\scene.json",
            "./nested/scene.json",
            "nested//scene.json",
            "nested/",
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            for field in ("scene_snapshot", "scene_asset"):
                for invalid_path in invalid_paths:
                    with self.subTest(field=field, path=invalid_path):
                        payload = scene_job()
                        set_source_path(payload, field, invalid_path)
                        self.assert_job_error(
                            "invalid_source",
                            payload,
                            job_dir,
                        )

    def test_missing_source_file_uses_missing_source_code_for_snapshot_and_asset(self):
        for field in ("scene_snapshot", "scene_asset"):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                payload = write_source_files(job_dir)
                target = job_dir.joinpath(*source_path(payload, field).split("/"))
                target.unlink()

                self.assert_job_error("missing_source", payload, job_dir)

    def test_source_directory_is_rejected_for_snapshot_and_asset(self):
        for field in ("scene_snapshot", "scene_asset"):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                payload = write_source_files(job_dir)
                target = job_dir.joinpath(*source_path(payload, field).split("/"))
                target.unlink()
                target.mkdir()

                self.assert_job_error("invalid_source", payload, job_dir)

    def test_empty_source_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            payload = write_source_files(job_dir, snapshot_bytes=b"")

            self.assert_job_error("invalid_source", payload, job_dir)

    def test_symlinked_source_file_is_rejected_for_snapshot_and_asset(self):
        for field in ("scene_snapshot", "scene_asset"):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                payload = write_source_files(job_dir)
                real_source = job_dir / f"real-{field}"
                real_source.write_bytes(b'{"schema_version":"1.0"}')
                target = job_dir.joinpath(*source_path(payload, field).split("/"))
                target.unlink()
                try:
                    target.symlink_to(real_source)
                except OSError as exc:
                    self.skipTest(f"File symlinks are unavailable: {exc}")

                self.assert_job_error("invalid_source", payload, job_dir)

    def test_symlinked_parent_escape_is_rejected_for_snapshot_and_asset(self):
        for field in ("scene_snapshot", "scene_asset"):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                job_dir = root / "job"
                outside = root / "outside"
                job_dir.mkdir()
                outside.mkdir()
                (outside / "scene").write_bytes(b'{"schema_version":"1.0"}')
                linked_parent = job_dir / "linked"
                try:
                    linked_parent.symlink_to(outside, target_is_directory=True)
                except OSError as exc:
                    self.skipTest(f"Directory symlinks are unavailable: {exc}")
                payload = scene_job()
                set_source_path(payload, field, "linked/scene")
                other_field = (
                    "scene_asset" if field == "scene_snapshot" else "scene_snapshot"
                )
                other_target = job_dir.joinpath(
                    *source_path(payload, other_field).split("/")
                )
                other_target.parent.mkdir(parents=True, exist_ok=True)
                if other_field == "scene_snapshot":
                    other_target.write_text(
                        '{"schema_version":"1.0"}',
                        encoding="utf-8",
                    )
                else:
                    other_target.write_bytes(b"opaque")

                self.assert_job_error(
                    "invalid_source",
                    payload,
                    job_dir,
                )


class SceneSnapshotContractTests(unittest.TestCase):
    def assert_invalid_snapshot(self, snapshot_bytes):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            payload = write_source_files(job_dir, snapshot_bytes=snapshot_bytes)
            with self.assertRaises(job_module.JobError) as raised:
                job_module.validate_job(payload, job_dir)
            self.assertEqual("invalid_source", raised.exception.code)

    def test_scene_snapshot_requires_strict_utf8_json_object_schema_1_0(self):
        invalid_snapshots = {
            "invalid UTF-8": b"\xff",
            "invalid JSON": b"{",
            "array": b"[]",
            "missing schema": b"{}",
            "wrong schema": b'{"schema_version":"2.0"}',
            "non-finite JSON constant": b'{"schema_version":"1.0","value":NaN}',
            "UTF-8 BOM": b'\xef\xbb\xbf{"schema_version":"1.0"}',
        }
        for case, snapshot_bytes in invalid_snapshots.items():
            with self.subTest(case=case):
                self.assert_invalid_snapshot(snapshot_bytes)

    def test_scene_asset_content_is_opaque_but_must_be_nonempty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            payload = write_source_files(job_dir, asset_bytes=b"\x00\xffnot parsed")

            job_module.validate_job(payload, job_dir)

        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            payload = write_source_files(job_dir, asset_bytes=b"")
            with self.assertRaises(job_module.JobError) as raised:
                job_module.validate_job(payload, job_dir)
            self.assertEqual("invalid_source", raised.exception.code)


class ViewEntityContractTests(unittest.TestCase):
    def test_entity_ids_must_be_unique_within_a_view(self):
        payload = view_job()
        payload["views"][0]["entities"].append(
            copy.deepcopy(payload["views"][0]["entities"][0])
        )

        with self.assertRaises(job_module.JobError) as raised:
            job_module.validate_job(payload)

        self.assertEqual("invalid_entity", raised.exception.code)

    def test_entity_ids_may_repeat_across_views(self):
        payload = view_job()
        second_view = copy.deepcopy(payload["views"][0])
        second_view["id"] = "side"
        second_view["label"] = "Side"
        payload["views"].append(second_view)

        job_module.validate_job(payload)

    def test_line_requires_a_stroked_layer(self):
        payload = view_job()
        payload["views"][0]["entities"][0]["layer"] = "text"

        with self.assertRaises(job_module.JobError) as raised:
            job_module.validate_job(payload)

        self.assertEqual("invalid_entity", raised.exception.code)

    def test_line_on_custom_layer_uses_default_stroked_style(self):
        payload = view_job()
        payload["views"][0]["entities"][0]["layer"] = "custom-outline"

        job_module.validate_job(payload)


class ImageAssistConstantOwnershipTests(unittest.TestCase):
    def test_job_validator_reuses_image_assist_supported_type_constants(self):
        contour_payload = view_job()
        contour_payload["image_assist"] = {
            "mode": "assistive",
            "overlays": [{"id": "contour", "type": "contour"}],
        }
        with mock.patch.object(image_assist, "SUPPORTED_OVERLAY_TYPES", set()):
            job_module.validate_job(contour_payload)

        primitive_payload = view_job()
        primitive_payload["image_assist"] = {
            "mode": "assistive",
            "overlays": [
                {
                    "id": "circle",
                    "primitive": "circle",
                    "type": "primitive_hint",
                }
            ],
        }
        with mock.patch.object(image_assist, "SUPPORTED_PRIMITIVES", set()):
            job_module.validate_job(primitive_payload)


class XmlTextContractTests(unittest.TestCase):
    def test_xml_1_0_incompatible_text_returns_controlled_invalid_text(self):
        invalid_characters = {
            "NUL": "\x00",
            "backspace": "\x08",
            "lone surrogate": "\ud800",
            "FFFE": "\ufffe",
            "FFFF": "\uffff",
        }
        for case, character in invalid_characters.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                payload = view_job()
                payload["views"][0]["entities"][0]["id"] = (
                    f"invalid-{character}-logical-id"
                )
                (job_dir / "job.json").write_text(
                    json.dumps(payload, ensure_ascii=True),
                    encoding="utf-8",
                )

                result = cli_module.main([str(job_dir)])

                self.assertEqual(1, result)
                diagnostics = json.loads(
                    (job_dir / "diagnostics.json").read_text(encoding="utf-8")
                )
                self.assertEqual("invalid_text", diagnostics["errors"][0]["code"])
                self.assertFalse((job_dir / "crash.log").exists())
                self.assertFalse((job_dir / "drawing_ir.json").exists())
                self.assertFalse((job_dir / "sheet.svg").exists())

    def test_xml_1_0_unicode_and_allowed_whitespace_render_parseable_svg(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            payload = view_job()
            payload["job_id"] = "allowed-\t-\n-\r-café-雪"
            (job_dir / "job.json").write_text(
                json.dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )

            result = cli_module.main([str(job_dir)])

            self.assertEqual(0, result)
            element_tree.fromstring((job_dir / "sheet.svg").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
