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
            backend_source = bridge.resolve_backend_source(
                str(ROOT / "backend" / "src")
            )
            result = bridge.run_bridge(
                bpy,
                bpy.context,
                backend_python=sys.executable,
                backend_src_path=backend_source,
                export_format="OBJ",
                job_root=temp_dir,
                timeout_seconds=30,
            )
            require(result.returncode == 0, f"backend returned {result.returncode}: {result.stderr}")
            require(result.asset_path.is_file(), f"asset is missing: {result.asset_path}")
            for name in (
                "scene_snapshot.json",
                "job.json",
                "drawing_ir.json",
                "sheet.svg",
                "diagnostics.json",
            ):
                output_path = result.job_dir / name
                require(output_path.is_file(), f"source bridge is missing {name}")
                require(output_path.stat().st_size > 0, f"source bridge wrote empty {name}")
            require(
                not (result.job_dir / "scene.glb").exists(),
                "source OBJ flow also wrote GLB",
            )

            snapshot = json.loads(
                (result.job_dir / "scene_snapshot.json").read_text(encoding="utf-8")
            )
            require(snapshot["schema_version"] == "1.0", "unexpected snapshot schema")
            require(
                snapshot["objects"][0]["name"] == "BridgeSmokeCube",
                "snapshot does not match source smoke scene",
            )

            diagnostics_path = result.job_dir / "diagnostics.json"
            drawing_ir_path = result.job_dir / "drawing_ir.json"
            svg_path = result.job_dir / "sheet.svg"
            diagnostics = json.loads(diagnostics_path.read_text(encoding="utf-8"))
            require(diagnostics["status"] == "ok", f"unexpected diagnostics: {diagnostics!r}")
            require(
                "projection_pending"
                in {warning.get("code") for warning in diagnostics["warnings"]},
                f"source diagnostics lack projection_pending: {diagnostics!r}",
            )
            require(
                result.approved_outputs
                == {
                    "diagnostics": diagnostics_path,
                    "drawing_ir": drawing_ir_path,
                    "svg": svg_path,
                },
                f"unexpected approved outputs: {result.approved_outputs!r}",
            )

            preview.clear_output_text_blocks(bpy)
            loaded = preview.load_outputs_into_text_blocks(
                bpy,
                result.approved_outputs,
            )
            require(set(loaded) == {"diagnostics", "svg"}, f"unexpected loaded outputs: {loaded!r}")
            diagnostics_text = bpy.data.texts.get(preview.DIAGNOSTICS_TEXT_NAME)
            svg_text = bpy.data.texts.get(preview.SVG_TEXT_NAME)
            require(diagnostics_text is not None, "diagnostics Text block was not loaded")
            require(svg_text is not None, "SVG Text block was not loaded")
            require(
                diagnostics_text.as_string()
                == diagnostics_path.read_text(encoding="utf-8"),
                "diagnostics Text block does not match source output",
            )
            require(
                svg_text.as_string() == svg_path.read_text(encoding="utf-8"),
                "SVG Text block does not contain raw source output",
            )
    finally:
        blueprints_addon.unregister()


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


if __name__ == "__main__":
    main()
