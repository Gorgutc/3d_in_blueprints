import json
import math
import os
import stat
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass
from pathlib import Path


SCENE_SNAPSHOT_SCHEMA_VERSION = "1.0"
BACKEND_NOT_CONFIGURED_MESSAGE = (
    "Backend Source is not configured. Extract the backend ZIP and select the folder "
    "containing blueprints_backend in Add-on Preferences."
)
SUCCESS_OUTPUT_MAPPING = {
    "diagnostics": "diagnostics.json",
    "drawing_ir": "drawing_ir.json",
    "svg": "sheet.svg",
}
OPTIONAL_SUCCESS_OUTPUT_MAPPING = {
    "image_assist_overlay": "assist_overlay.svg",
}
ERROR_OUTPUT_MAPPING = {
    "crash_log": "crash.log",
}


class BridgeError(RuntimeError):
    pass


class BridgeConfigurationError(BridgeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


class _StrictDataError(ValueError):
    pass


@dataclass(frozen=True)
class BackendOutputState:
    diagnostics: dict
    returncode: int
    approved_outputs: dict[str, Path]


@dataclass(frozen=True)
class BridgeResult:
    job_dir: Path
    returncode: int
    diagnostics: dict
    stdout: str
    stderr: str
    asset_path: Path
    approved_outputs: dict[str, Path]


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
    output_state = ensure_backend_outputs(
        job_dir,
        backend.returncode,
        expected_job_id=backend_job["job_id"],
    )
    return BridgeResult(
        job_dir=job_dir,
        returncode=output_state.returncode,
        diagnostics=output_state.diagnostics,
        stdout=backend.stdout,
        stderr=backend.stderr,
        asset_path=asset_path,
        approved_outputs=output_state.approved_outputs,
    )


def resolve_backend_source(configured_path, *, bridge_path=__file__):
    if configured_path is not None and str(configured_path).strip():
        try:
            source = Path(configured_path).expanduser().resolve()
        except (OSError, RuntimeError, TypeError, ValueError):
            raise backend_not_configured() from None
        if is_backend_source(source):
            return source
        raise backend_not_configured()

    try:
        repository_root = find_repo_root(bridge_path)
    except BridgeError:
        raise backend_not_configured() from None
    source = (repository_root / "backend" / "src").resolve()
    if not is_backend_source(source):
        raise backend_not_configured()
    return source


def backend_not_configured():
    return BridgeConfigurationError(
        "backend_not_configured",
        BACKEND_NOT_CONFIGURED_MESSAGE,
    )


def is_backend_source(source):
    package = source / "blueprints_backend"
    return (
        source.is_dir()
        and package.is_dir()
        and not package.is_symlink()
        and is_regular_file(package / "__init__.py", allow_empty=True)
        and is_regular_file(package / "__main__.py", allow_empty=True)
    )


def find_repo_root(start_path):
    current = Path(start_path).resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if is_backend_source(candidate / "backend" / "src"):
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
    job_dir = Path(job_dir).expanduser().resolve()
    backend_src_path = resolve_backend_source(backend_src_path)
    python_executable = (
        sys.executable
        if backend_python is None or not str(backend_python).strip()
        else str(backend_python)
    )
    command = [python_executable, "-m", "blueprints_backend", str(job_dir)]
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONPATH"] = str(backend_src_path) + (
        os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else ""
    )

    try:
        return subprocess.run(
            command,
            cwd=str(backend_src_path),
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
        replace_diagnostics_file(job_dir / "diagnostics.json", diagnostics)
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
        replace_diagnostics_file(job_dir / "diagnostics.json", diagnostics)
        return subprocess.CompletedProcess(command, 127, "", str(exc))


def ensure_backend_outputs(job_dir, returncode, expected_job_id):
    job_dir = Path(job_dir).expanduser().resolve()
    diagnostics_path = job_dir / "diagnostics.json"
    if not diagnostics_path.exists() and not diagnostics_path.is_symlink():
        return backend_output_failure(
            diagnostics_path,
            returncode,
            "backend_missing_diagnostics",
            "Backend did not write diagnostics.json.",
        )

    try:
        require_regular_output(diagnostics_path, job_dir)
        diagnostics = read_strict_json_object(diagnostics_path)
        validate_diagnostics(diagnostics)
    except Exception:
        return backend_output_failure(
            diagnostics_path,
            returncode,
            "backend_invalid_diagnostics",
            "Backend diagnostics.json is invalid or does not match schema 1.0.",
        )

    status = diagnostics["status"]
    if (status == "ok") != (returncode == 0):
        return backend_output_failure(
            diagnostics_path,
            returncode,
            "backend_status_mismatch",
            "Backend process exit code does not match diagnostics status.",
        )

    try:
        output_paths = validate_output_mapping(job_dir, status, diagnostics["outputs"])
    except _StrictDataError:
        return backend_output_failure(
            diagnostics_path,
            returncode,
            "backend_invalid_outputs",
            "Backend outputs do not match the approved output contract.",
        )

    missing = [
        output_path.name
        for output_path in output_paths.values()
        if not output_path.exists() and not output_path.is_symlink()
    ]
    if missing:
        return backend_output_failure(
            diagnostics_path,
            returncode,
            "backend_missing_outputs",
            f"Backend did not write declared outputs: {', '.join(sorted(missing))}.",
        )

    try:
        for output_path in output_paths.values():
            require_regular_output(output_path, job_dir)
        if status == "ok":
            validate_success_outputs(output_paths, expected_job_id)
        elif "crash_log" in output_paths:
            output_paths["crash_log"].read_bytes().decode("utf-8")
    except Exception:
        return backend_output_failure(
            diagnostics_path,
            returncode,
            "backend_invalid_outputs",
            "Backend outputs are invalid or do not match their declared schemas.",
        )

    approved_outputs = {"diagnostics": diagnostics_path}
    approved_outputs.update(output_paths)
    return BackendOutputState(
        diagnostics=diagnostics,
        returncode=returncode,
        approved_outputs=approved_outputs,
    )


def validate_diagnostics(diagnostics):
    if diagnostics.get("schema_version") != "1.0":
        raise _StrictDataError("Unsupported diagnostics schema.")
    if diagnostics.get("status") not in {"ok", "error"}:
        raise _StrictDataError("Invalid diagnostics status.")
    if not isinstance(diagnostics.get("errors"), list):
        raise _StrictDataError("Diagnostics errors must be a list.")
    if not isinstance(diagnostics.get("warnings"), list):
        raise _StrictDataError("Diagnostics warnings must be a list.")
    if not isinstance(diagnostics.get("outputs"), dict):
        raise _StrictDataError("Diagnostics outputs must be an object.")

    validate_diagnostic_items(diagnostics["errors"])
    validate_diagnostic_items(diagnostics["warnings"])
    if diagnostics["status"] == "ok" and diagnostics["errors"]:
        raise _StrictDataError("Successful diagnostics cannot contain errors.")
    if diagnostics["status"] == "error" and not diagnostics["errors"]:
        raise _StrictDataError("Error diagnostics must contain an error item.")


def validate_diagnostic_items(items):
    for item in items:
        if not isinstance(item, dict):
            raise _StrictDataError("Diagnostic items must be objects.")
        if not isinstance(item.get("code"), str) or not item["code"]:
            raise _StrictDataError("Diagnostic codes must be non-empty strings.")
        if not isinstance(item.get("message"), str) or not item["message"]:
            raise _StrictDataError("Diagnostic messages must be non-empty strings.")


def validate_output_mapping(job_dir, status, outputs):
    if status == "ok":
        allowed = {**SUCCESS_OUTPUT_MAPPING, **OPTIONAL_SUCCESS_OUTPUT_MAPPING}
        required_keys = set(SUCCESS_OUTPUT_MAPPING)
    else:
        allowed = ERROR_OUTPUT_MAPPING
        required_keys = set()

    if not required_keys.issubset(outputs) or not set(outputs).issubset(allowed):
        raise _StrictDataError("Output keys are not approved for this status.")
    for output_name, filename in outputs.items():
        if filename != allowed[output_name]:
            raise _StrictDataError("Output filename does not match its approved name.")

    return {
        output_name: job_dir / filename
        for output_name, filename in outputs.items()
        if output_name != "diagnostics"
    }


def validate_success_outputs(output_paths, expected_job_id):
    if not isinstance(expected_job_id, str) or not expected_job_id:
        raise _StrictDataError("Expected job_id must be a non-empty string.")
    drawing_ir = read_strict_json_object(output_paths["drawing_ir"])
    if drawing_ir.get("schema_version") != "1.0":
        raise _StrictDataError("DrawingIR schema_version must be 1.0.")
    if drawing_ir.get("source_job_id") != expected_job_id:
        raise _StrictDataError("DrawingIR source_job_id must match the submitted job_id.")
    if not isinstance(drawing_ir.get("sheet"), dict):
        raise _StrictDataError("DrawingIR sheet must be an object.")
    if not is_object_list(drawing_ir.get("layers")):
        raise _StrictDataError("DrawingIR layers must be a list of objects.")
    if not is_object_list(drawing_ir.get("views")):
        raise _StrictDataError("DrawingIR views must be a list of objects.")

    validate_svg(output_paths["svg"])
    if "image_assist_overlay" in output_paths:
        validate_svg(output_paths["image_assist_overlay"])


def is_object_list(value):
    return isinstance(value, list) and all(isinstance(item, dict) for item in value)


def validate_svg(path):
    svg_text = path.read_bytes().decode("utf-8")
    root = ElementTree.fromstring(svg_text)
    if root.tag not in {"svg", "{http://www.w3.org/2000/svg}svg"}:
        raise _StrictDataError("SVG output must have an svg root element.")


def read_strict_json_object(path):
    text = path.read_bytes().decode("utf-8")
    payload = json.loads(
        text,
        object_pairs_hook=strict_object,
        parse_constant=reject_json_constant,
        parse_float=parse_finite_float,
    )
    if not isinstance(payload, dict):
        raise _StrictDataError("JSON root must be an object.")
    return payload


def strict_object(pairs):
    payload = {}
    for key, value in pairs:
        if key in payload:
            raise _StrictDataError(f"Duplicate JSON key {key}.")
        payload[key] = value
    return payload


def reject_json_constant(value):
    raise _StrictDataError(f"Non-finite JSON value {value}.")


def parse_finite_float(value):
    number = float(value)
    if not math.isfinite(number):
        raise _StrictDataError("JSON numbers must be finite.")
    return number


def require_regular_output(path, job_dir):
    if not is_regular_file(path):
        raise _StrictDataError("Output must be a regular, non-empty file.")
    resolved = path.resolve(strict=True)
    try:
        resolved.relative_to(job_dir.resolve(strict=True))
    except ValueError:
        raise _StrictDataError("Output must stay within the job folder.") from None


def is_regular_file(path, *, allow_empty=False):
    try:
        file_stat = path.lstat()
    except OSError:
        return False
    return (
        stat.S_ISREG(file_stat.st_mode)
        and not path.is_symlink()
        and (allow_empty or file_stat.st_size > 0)
    )


def backend_output_failure(diagnostics_path, returncode, code, message):
    diagnostics = bridge_error_diagnostics(code, message)
    approved_outputs = {}
    if replace_diagnostics_file(diagnostics_path, diagnostics):
        approved_outputs["diagnostics"] = diagnostics_path
    return BackendOutputState(
        diagnostics=diagnostics,
        returncode=nonzero_returncode(returncode),
        approved_outputs=approved_outputs,
    )


def replace_diagnostics_file(path, diagnostics):
    try:
        if path.is_symlink() or path.is_file():
            path.unlink()
        elif path.exists():
            path.rmdir()
        write_json(path, diagnostics)
        return is_regular_file(path)
    except OSError:
        return False


def nonzero_returncode(returncode):
    return returncode if isinstance(returncode, int) and returncode != 0 else 1


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
