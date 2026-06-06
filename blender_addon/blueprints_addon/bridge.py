import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


SCENE_SNAPSHOT_SCHEMA_VERSION = "1.0"
REQUIRED_BACKEND_OUTPUTS = ("diagnostics.json", "drawing_ir.json", "sheet.svg")


class BridgeError(RuntimeError):
    pass


@dataclass(frozen=True)
class BridgeResult:
    job_dir: Path
    returncode: int
    diagnostics: dict
    stdout: str
    stderr: str
    asset_path: Path


def run_bridge(
    bpy_module,
    context,
    *,
    backend_python=None,
    backend_src_path=None,
    export_format="OBJ",
    job_root=None,
    timeout_seconds=30,
):
    job_dir = create_job_dir(job_root)
    snapshot = scene_snapshot(bpy_module, context)
    write_json(job_dir / "scene_snapshot.json", snapshot)
    asset_path = export_scene_asset(bpy_module, job_dir, export_format)
    backend_job = build_backend_job(snapshot, asset_path)
    write_json(job_dir / "job.json", backend_job)
    backend = run_backend(
        job_dir,
        backend_python=backend_python,
        backend_src_path=backend_src_path,
        timeout_seconds=timeout_seconds,
    )
    diagnostics = ensure_backend_outputs(job_dir, backend.returncode)
    returncode = backend.returncode
    if diagnostics.get("status") == "error" and returncode == 0:
        returncode = 1
    return BridgeResult(
        job_dir=job_dir,
        returncode=returncode,
        diagnostics=diagnostics,
        stdout=backend.stdout,
        stderr=backend.stderr,
        asset_path=asset_path,
    )


def find_repo_root(start_path):
    current = Path(start_path).resolve()
    for candidate in (current, *current.parents):
        if (candidate / "backend" / "src" / "blueprints_backend").exists():
            return candidate
    raise BridgeError(f"Could not find repository root from {start_path}.")


def create_job_dir(job_root=None):
    if job_root:
        root = Path(job_root).expanduser().resolve()
        root.mkdir(parents=True, exist_ok=True)
        return Path(tempfile.mkdtemp(prefix="blueprints-job-", dir=str(root)))
    return Path(tempfile.mkdtemp(prefix="blueprints-job-"))


def scene_snapshot(bpy_module, context):
    scene = context.scene
    return {
        "schema_version": SCENE_SNAPSHOT_SCHEMA_VERSION,
        "scene_name": scene.name,
        "unit_system": scene.unit_settings.system,
        "unit_scale": float(scene.unit_settings.scale_length),
        "objects": [
            object_snapshot(obj)
            for obj in scene.objects
            if obj.visible_get()
        ],
    }


def object_snapshot(obj):
    return {
        "bound_box": [[float(coord) for coord in corner] for corner in obj.bound_box],
        "dimensions": [float(value) for value in obj.dimensions],
        "id": obj.name_full,
        "location": [float(value) for value in obj.location],
        "matrix_world": [
            [float(value) for value in row]
            for row in obj.matrix_world
        ],
        "name": obj.name,
        "type": obj.type,
    }


def export_scene_asset(bpy_module, job_dir, export_format):
    normalized = export_format.upper()
    if normalized == "OBJ":
        return export_obj(bpy_module, job_dir / "scene.obj")
    if normalized == "GLB":
        return export_glb(bpy_module, job_dir / "scene.glb")
    raise BridgeError(f"Unsupported export format {export_format}.")


def export_obj(bpy_module, output_path):
    try:
        bpy_module.ops.wm.obj_export(filepath=str(output_path), export_selected_objects=False)
    except Exception as exc:
        try:
            bpy_module.ops.export_scene.obj(filepath=str(output_path), use_selection=False)
        except Exception as legacy_exc:
            raise BridgeError(f"OBJ export failed: {legacy_exc}") from exc
    ensure_export(output_path, "OBJ")
    return output_path


def export_glb(bpy_module, output_path):
    try:
        bpy_module.ops.export_scene.gltf(filepath=str(output_path), export_format="GLB", use_selection=False)
    except Exception as exc:
        raise BridgeError(f"GLB export failed: {exc}") from exc
    ensure_export(output_path, "GLB")
    return output_path


def ensure_export(output_path, label):
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise BridgeError(f"{label} export did not create {output_path}.")


def build_backend_job(snapshot, asset_path):
    return {
        "job_id": f"{snapshot['scene_name']}-bridge",
        "schema_version": "1.0",
        "sheet": {
            "format": "A4",
            "height_mm": 297,
            "standard": "GOST",
            "title_block": {
                "designation": f"{snapshot['scene_name']}-bridge",
                "scale": "1:1",
                "sheet": "1",
                "sheets": "1",
                "title": snapshot["scene_name"],
            },
            "width_mm": 210,
        },
        "source": {
            "assets": {
                "scene": asset_path.name,
            },
            "scene_snapshot": "scene_snapshot.json",
        },
    }


def run_backend(job_dir, *, backend_python=None, backend_src_path=None, timeout_seconds=30):
    python_executable = backend_python or sys.executable
    command = [python_executable, "-m", "blueprints_backend", str(job_dir)]
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    if backend_src_path:
        env["PYTHONPATH"] = str(backend_src_path) + (
            os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else ""
        )

    try:
        return subprocess.run(
            command,
            cwd=str(job_dir),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        diagnostics = {
            "errors": [
                {
                    "code": "backend_timeout",
                    "message": f"Backend did not finish within {timeout_seconds} seconds.",
                }
            ],
            "outputs": {},
            "schema_version": "1.0",
            "status": "error",
            "warnings": [],
        }
        write_json(job_dir / "diagnostics.json", diagnostics)
        return subprocess.CompletedProcess(command, 124, exc.stdout or "", exc.stderr or "")
    except OSError as exc:
        diagnostics = {
            "errors": [
                {
                    "code": "backend_spawn_failed",
                    "message": f"Could not start backend process: {exc}.",
                }
            ],
            "outputs": {},
            "schema_version": "1.0",
            "status": "error",
            "warnings": [],
        }
        write_json(job_dir / "diagnostics.json", diagnostics)
        return subprocess.CompletedProcess(command, 127, "", str(exc))


def ensure_backend_outputs(job_dir, returncode):
    diagnostics_path = job_dir / "diagnostics.json"
    if not diagnostics_path.exists():
        diagnostics = bridge_error_diagnostics(
            "backend_missing_diagnostics",
            "Backend did not write diagnostics.json.",
        )
        write_json(diagnostics_path, diagnostics)
        return diagnostics

    try:
        diagnostics = read_json(diagnostics_path)
    except json.JSONDecodeError as exc:
        diagnostics = bridge_error_diagnostics(
            "backend_invalid_diagnostics",
            f"Backend diagnostics.json is not valid JSON: {exc.msg}.",
        )
        write_json(diagnostics_path, diagnostics)
        return diagnostics

    if returncode == 0:
        missing = [
            name
            for name in REQUIRED_BACKEND_OUTPUTS
            if not (job_dir / name).exists()
        ]
        if missing:
            diagnostics = bridge_error_diagnostics(
                "backend_missing_outputs",
                f"Backend exited successfully but did not write: {', '.join(missing)}.",
            )
            write_json(diagnostics_path, diagnostics)
            return diagnostics

    return diagnostics


def bridge_error_diagnostics(code, message):
    return {
        "errors": [
            {
                "code": code,
                "message": message,
            }
        ],
        "outputs": {},
        "schema_version": "1.0",
        "status": "error",
        "warnings": [],
    }


def write_json(path, payload):
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def read_json(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))
