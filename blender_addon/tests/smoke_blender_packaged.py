import contextlib
import importlib
import io
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

import bpy


ADDON_MODULE = "blueprints_addon"
EXPECTED_CONFIGURATION_ERROR = (
    "Backend Source is not configured. Extract the backend ZIP and select the folder "
    "containing blueprints_backend in Add-on Preferences."
)
REQUIRED_JOB_FILES = (
    "diagnostics.json",
    "drawing_ir.json",
    "job.json",
    "scene.obj",
    "scene_snapshot.json",
    "sheet.svg",
)


def main():
    paths = smoke_paths()
    assert_isolated_environment(paths)
    require(ADDON_MODULE not in sys.modules, "add-on leaked into packaged smoke sys.modules")
    require(zipfile.is_zipfile(paths["addon_zip"]), "add-on artifact is not a ZIP")
    require(zipfile.is_zipfile(paths["backend_zip"]), "backend artifact is not a ZIP")
    require(not job_directories(paths["runtime_temp"]), "packaged runtime temp started with job folders")

    installed = False
    try:
        install_result = bpy.ops.preferences.addon_install(
            filepath=str(paths["addon_zip"]),
            overwrite=True,
            enable_on_install=False,
        )
        require(install_result == {"FINISHED"}, f"add-on install returned {install_result}")

        enable_result = bpy.ops.preferences.addon_enable(module=ADDON_MODULE)
        require(enable_result == {"FINISHED"}, f"add-on enable returned {enable_result}")
        installed = True

        addon = importlib.import_module(ADDON_MODULE)
        assert_installed_module(addon, paths)
        operator_results, bridge_calls = instrument_operator(addon)
        prefs = bpy.context.preferences.addons[ADDON_MODULE].preferences
        assert_default_preferences(prefs)
        assert_no_preview_blocks(addon)

        run_blank_configuration_case(operator_results, bridge_calls, paths, addon)
        backend_source = extract_backend_bundle(paths["backend_zip"], paths["temp_root"] / "backend")
        run_configured_backend_case(
            addon,
            prefs,
            backend_source,
            operator_results,
            bridge_calls,
            paths,
        )
    finally:
        if bpy.context.preferences.addons.get(ADDON_MODULE) is not None:
            disable_result = bpy.ops.preferences.addon_disable(module=ADDON_MODULE)
            require(disable_result == {"FINISHED"}, f"add-on disable returned {disable_result}")
        if installed:
            require(
                bpy.context.preferences.addons.get(ADDON_MODULE) is None,
                "add-on remained enabled after packaged smoke",
            )
            require(not operator_is_registered(), "blueprints.generate remained registered after disable")

    print("[PASS] packaged add-on blank configuration")
    print("[PASS] packaged add-on configured backend")


def smoke_paths():
    return {
        "addon_zip": required_path("BLUEPRINTS_PACKAGED_ADDON_ZIP", file=True),
        "backend_zip": required_path("BLUEPRINTS_PACKAGED_BACKEND_ZIP", file=True),
        "checkout_root": required_path("BLUEPRINTS_PACKAGED_CHECKOUT_ROOT", directory=True),
        "cwd": required_path("BLUEPRINTS_PACKAGED_CWD", directory=True),
        "runtime_temp": required_path("BLUEPRINTS_PACKAGED_RUNTIME_TEMP", directory=True),
        "temp_root": required_path("BLUEPRINTS_PACKAGED_TEMP_ROOT", directory=True),
        "user_config": required_path("BLENDER_USER_CONFIG", directory=True),
        "user_datafiles": required_path("BLENDER_USER_DATAFILES", directory=True),
        "user_extensions": required_path("BLENDER_USER_EXTENSIONS", directory=True),
        "user_scripts": required_path("BLENDER_USER_SCRIPTS", directory=True),
    }


def required_path(name, *, directory=False, file=False):
    value = os.environ.get(name)
    require(value, f"{name} is required")
    resolved = Path(value).resolve()
    if directory:
        require(resolved.is_dir(), f"{name} is not a directory: {resolved}")
    if file:
        require(resolved.is_file(), f"{name} is not a file: {resolved}")
    return resolved


def assert_isolated_environment(paths):
    require(Path.cwd().resolve() == paths["cwd"], "packaged Blender cwd is not isolated")
    require(not os.environ.get("PYTHONPATH"), "packaged Blender inherited PYTHONPATH")
    require(
        not os.environ.get("BLUEPRINTS_REPO_ROOT"),
        "packaged Blender inherited source-checkout discovery state",
    )
    require(Path(tempfile.gettempdir()).resolve() == paths["runtime_temp"], "runtime temp is not isolated")
    for key in ("user_config", "user_datafiles", "user_extensions", "user_scripts"):
        require(is_within(paths[key], paths["temp_root"]), f"{key} is outside packaged temp root")
    require(is_within(paths["addon_zip"], paths["temp_root"]), "add-on ZIP is outside packaged temp root")
    require(is_within(paths["backend_zip"], paths["temp_root"]), "backend ZIP is outside packaged temp root")


def assert_installed_module(addon, paths):
    require(addon.bl_info["version"] == (0, 2, 1), f"unexpected add-on version: {addon.bl_info['version']!r}")
    for module in (addon, addon.bridge, addon.operator_flow, addon.preview):
        module_path = Path(module.__file__).resolve()
        require(
            is_within(module_path, paths["user_scripts"]),
            f"add-on module loaded outside temp user scripts: {module_path}",
        )
        require(
            not is_within(module_path, paths["checkout_root"]),
            f"add-on module loaded from checkout: {module_path}",
        )
        require(
            "blueprints_addon" in module_path.parts,
            f"unexpected installed module path: {module_path}",
        )


def instrument_operator(addon):
    operator_results = []
    bridge_calls = []
    original_execute = addon.BLUEPRINTS_OT_generate.execute
    original_run_bridge = addon.bridge.run_bridge

    def recording_execute(self, context):
        result = original_execute(self, context)
        operator_results.append(frozenset(result))
        return result

    def recording_run_bridge(*args, **kwargs):
        call = {"kwargs": dict(kwargs), "result": None}
        bridge_calls.append(call)
        call["result"] = original_run_bridge(*args, **kwargs)
        return call["result"]

    addon.BLUEPRINTS_OT_generate.execute = recording_execute
    addon.bridge.run_bridge = recording_run_bridge
    return operator_results, bridge_calls


def assert_default_preferences(prefs):
    require(prefs.backend_python == "", "Backend Python default is not blank")
    require(prefs.backend_source == "", "Backend Source default is not blank")
    require(prefs.job_root == "", "Job Root default is not blank")
    require(prefs.export_format == "OBJ", "packaged smoke requires the default OBJ export")


def run_blank_configuration_case(operator_results, bridge_calls, paths, addon):
    before_jobs = job_directories(paths["runtime_temp"])
    captured = io.StringIO()
    caught_error = None
    try:
        with contextlib.redirect_stdout(captured):
            bpy.ops.blueprints.generate()
    except RuntimeError as exc:
        caught_error = str(exc).strip()

    expected_report = f"Error: {EXPECTED_CONFIGURATION_ERROR}"
    report_lines = [line.strip() for line in captured.getvalue().splitlines() if line.strip()]
    require(caught_error == expected_report, f"unexpected blank-config exception: {caught_error!r}")
    require(report_lines == [expected_report], f"unexpected blank-config reports: {report_lines!r}")
    require(operator_results == [frozenset({"CANCELLED"})], f"blank-config result was {operator_results!r}")
    require(not bridge_calls, "blank configuration invoked the bridge")
    require(job_directories(paths["runtime_temp"]) == before_jobs, "blank configuration created a job")
    require(not list(paths["runtime_temp"].rglob("scene.obj")), "blank configuration exported OBJ")
    require(not list(paths["runtime_temp"].rglob("scene.glb")), "blank configuration exported GLB")
    assert_empty_preview_blocks(addon)


def extract_backend_bundle(backend_zip, destination):
    destination.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(backend_zip) as archive:
        for info in archive.infolist():
            archive_path = PurePosixPath(info.filename)
            require(not archive_path.is_absolute(), f"backend ZIP contains absolute path {info.filename}")
            require(".." not in archive_path.parts, f"backend ZIP contains traversal path {info.filename}")
        archive.extractall(destination)

    require((destination / "blueprints_backend" / "__init__.py").is_file(), "backend ZIP layout is invalid")
    require((destination / "blueprints_backend" / "__main__.py").is_file(), "backend ZIP entrypoint is missing")
    return destination


def run_configured_backend_case(addon, prefs, backend_source, operator_results, bridge_calls, paths):
    require(is_within(backend_source, paths["temp_root"]), "extracted backend escaped packaged temp root")
    require(not is_within(backend_source, paths["checkout_root"]), "configured backend came from checkout")
    prefs.backend_source = str(backend_source)
    require(prefs.backend_python == "", "Backend Python must remain blank")
    require(prefs.export_format == "OBJ", "configured packaged smoke must use OBJ")
    reset_scene()
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
    bpy.context.object.name = "PackagedSmokeCube"

    captured = io.StringIO()
    with contextlib.redirect_stdout(captured):
        result = bpy.ops.blueprints.generate()
    reports = captured.getvalue()

    require(result == {"FINISHED"}, f"configured operator returned {result}")
    require(operator_results[-1] == frozenset({"FINISHED"}), f"recorded result was {operator_results[-1]!r}")
    require("Warning:" in reports and "projection_pending" in reports, f"missing projection warning: {reports!r}")
    require("Blueprint generated" not in reports, f"projection placeholder reported ordinary success: {reports!r}")
    require(len(bridge_calls) == 1, f"expected one configured bridge call, got {len(bridge_calls)}")

    bridge_call = bridge_calls[0]
    require(bridge_call["kwargs"]["backend_python"] == sys.executable, "blank Backend Python did not use sys.executable")
    require(
        Path(bridge_call["kwargs"]["backend_src_path"]).resolve() == backend_source,
        "operator did not use extracted Backend Source",
    )
    require(bridge_call["kwargs"]["export_format"] == "OBJ", "operator did not request OBJ export")
    bridge_result = bridge_call["result"]
    require(bridge_result is not None, "configured bridge did not return")
    job_dir = Path(bridge_result.job_dir).resolve()
    require(is_within(job_dir, paths["runtime_temp"]), f"job escaped isolated runtime temp: {job_dir}")
    require(job_directories(paths["runtime_temp"]) == {job_dir}, "configured smoke created unexpected jobs")
    require(not (job_dir / "scene.glb").exists(), "configured OBJ flow also wrote GLB")
    require(not list(paths["runtime_temp"].rglob("*.glb")), "packaged smoke produced a GLB artifact")

    for name in REQUIRED_JOB_FILES:
        output_path = job_dir / name
        require(output_path.is_file(), f"configured job is missing {name}")
        require(output_path.stat().st_size > 0, f"configured job wrote empty {name}")

    snapshot = read_json(job_dir / "scene_snapshot.json")
    require(snapshot["objects"][0]["name"] == "PackagedSmokeCube", "snapshot does not match packaged scene")
    job = read_json(job_dir / "job.json")
    require(job["source"]["assets"]["scene"] == "scene.obj", "job does not reference OBJ")
    diagnostics = read_json(job_dir / "diagnostics.json")
    require(diagnostics["status"] == "ok", f"configured diagnostics are not ok: {diagnostics!r}")
    require(diagnostics["errors"] == [], f"configured diagnostics contain errors: {diagnostics!r}")
    warning_codes = [warning.get("code") for warning in diagnostics["warnings"]]
    require("projection_pending" in warning_codes, f"diagnostics lack projection_pending: {warning_codes!r}")
    require(
        diagnostics["outputs"] == {
            "diagnostics": "diagnostics.json",
            "drawing_ir": "drawing_ir.json",
            "svg": "sheet.svg",
        },
        f"unexpected diagnostics outputs: {diagnostics['outputs']!r}",
    )
    require(
        bridge_result.approved_outputs
        == {
            "diagnostics": job_dir / "diagnostics.json",
            "drawing_ir": job_dir / "drawing_ir.json",
            "svg": job_dir / "sheet.svg",
        },
        f"unexpected approved bridge outputs: {bridge_result.approved_outputs!r}",
    )

    diagnostics_text = bpy.data.texts.get(addon.preview.DIAGNOSTICS_TEXT_NAME)
    svg_text = bpy.data.texts.get(addon.preview.SVG_TEXT_NAME)
    require(diagnostics_text is not None, "diagnostics Text block was not loaded")
    require(svg_text is not None, "SVG Text block was not loaded")
    require(
        diagnostics_text.as_string() == (job_dir / "diagnostics.json").read_text(encoding="utf-8"),
        "diagnostics Text block does not match the configured job",
    )
    require(
        svg_text.as_string() == (job_dir / "sheet.svg").read_text(encoding="utf-8"),
        "SVG Text block does not match the configured job",
    )


def assert_no_preview_blocks(addon):
    require(bpy.data.texts.get(addon.preview.DIAGNOSTICS_TEXT_NAME) is None, "diagnostics Text block already exists")
    require(bpy.data.texts.get(addon.preview.SVG_TEXT_NAME) is None, "SVG Text block already exists")


def assert_empty_preview_blocks(addon):
    diagnostics_text = bpy.data.texts.get(addon.preview.DIAGNOSTICS_TEXT_NAME)
    svg_text = bpy.data.texts.get(addon.preview.SVG_TEXT_NAME)
    require(diagnostics_text is not None, "blank configuration did not clear diagnostics preview")
    require(svg_text is not None, "blank configuration did not clear SVG preview")
    require(diagnostics_text.as_string() == "", "blank configuration left stale diagnostics preview")
    require(svg_text.as_string() == "", "blank configuration left stale SVG preview")


def job_directories(runtime_temp):
    return {path.resolve() for path in runtime_temp.glob("blueprints-job-*") if path.is_dir()}


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def operator_is_registered():
    try:
        bpy.ops.blueprints.generate.get_rna_type()
    except (AttributeError, KeyError, RuntimeError):
        return False
    return True


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def is_within(candidate, parent):
    try:
        Path(candidate).resolve().relative_to(Path(parent).resolve())
    except ValueError:
        return False
    return Path(candidate).resolve() != Path(parent).resolve()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


if __name__ == "__main__":
    main()
