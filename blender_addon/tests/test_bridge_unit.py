import json
import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BRIDGE_PATH = ROOT / "blender_addon" / "blueprints_addon" / "bridge.py"
BRIDGE_SPEC = importlib.util.spec_from_file_location("blueprints_bridge_under_test", BRIDGE_PATH)
bridge = importlib.util.module_from_spec(BRIDGE_SPEC)
BRIDGE_SPEC.loader.exec_module(bridge)


class BridgeUnitTests(unittest.TestCase):
    def test_backend_spawn_failure_writes_diagnostics(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            missing_python = job_dir / "missing-python.exe"

            result = bridge.run_backend(
                job_dir,
                backend_python=str(missing_python),
                backend_src_path=str(job_dir),
                timeout_seconds=1,
            )

            self.assertEqual(127, result.returncode)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("error", diagnostics["status"])
            self.assertEqual("backend_spawn_failed", diagnostics["errors"][0]["code"])

    def test_success_without_required_outputs_is_marked_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            bridge.write_json(
                job_dir / "diagnostics.json",
                {
                    "errors": [],
                    "outputs": {},
                    "schema_version": "1.0",
                    "status": "ok",
                    "warnings": [],
                },
            )

            diagnostics = bridge.ensure_backend_outputs(job_dir, 0)

            self.assertEqual("error", diagnostics["status"])
            self.assertEqual("backend_missing_outputs", diagnostics["errors"][0]["code"])

    def test_backend_job_contains_scene_source_not_drawing_entities(self):
        payload = bridge.build_backend_job(
            {
                "objects": [
                    {
                        "id": "Cube",
                    }
                ],
                "scene_name": "Scene",
            },
            Path("scene.obj"),
        )

        self.assertNotIn("views", payload)
        self.assertEqual("scene_snapshot.json", payload["source"]["scene_snapshot"])
        self.assertEqual("scene.obj", payload["source"]["assets"]["scene"])


if __name__ == "__main__":
    unittest.main()
