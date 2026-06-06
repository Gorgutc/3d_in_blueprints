import json
import os
import sys
import tempfile
from pathlib import Path


def repo_root():
    if os.environ.get("BLUEPRINTS_REPO_ROOT"):
        return Path(os.environ["BLUEPRINTS_REPO_ROOT"]).resolve()
    return Path(__file__).resolve().parents[2]


ROOT = repo_root()
sys.path.insert(0, str(ROOT / "blender_addon"))
sys.path.insert(0, str(ROOT / "backend" / "src"))

import bpy  # noqa: E402
import blueprints_addon  # noqa: E402
from blueprints_addon import bridge  # noqa: E402
from blueprints_addon import preview  # noqa: E402


def main():
    blueprints_addon.register()
    try:
        reset_scene()
        bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
        bpy.context.object.name = "BridgeSmokeCube"

        with tempfile.TemporaryDirectory(prefix="blueprints-blender-smoke-") as temp_dir:
            result = bridge.run_bridge(
                bpy,
                bpy.context,
                backend_python=sys.executable,
                backend_src_path=str(ROOT / "backend" / "src"),
                export_format="OBJ",
                job_root=temp_dir,
                timeout_seconds=30,
            )
            assert result.returncode == 0, result.stderr
            assert result.asset_path.exists(), result.asset_path
            assert (result.job_dir / "scene_snapshot.json").exists()
            assert (result.job_dir / "job.json").exists()
            assert (result.job_dir / "drawing_ir.json").exists()
            assert (result.job_dir / "sheet.svg").exists()
            assert (result.job_dir / "diagnostics.json").exists()

            snapshot = json.loads((result.job_dir / "scene_snapshot.json").read_text(encoding="utf-8"))
            assert snapshot["schema_version"] == "1.0"
            assert snapshot["objects"][0]["name"] == "BridgeSmokeCube"

            diagnostics = json.loads((result.job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            assert diagnostics["status"] == "ok", diagnostics

            loaded = preview.load_outputs_into_text_blocks(bpy, result.job_dir)
            assert "diagnostics" in loaded
            assert "svg" in loaded
            assert bpy.data.texts.get(preview.DIAGNOSTICS_TEXT_NAME)
            assert bpy.data.texts.get(preview.SVG_TEXT_NAME)
    finally:
        blueprints_addon.unregister()


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


if __name__ == "__main__":
    main()
