import argparse
import ast
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
ZIP_EPOCH = (2026, 1, 1, 0, 0, 0)
BACKEND_SMOKE_TIMEOUT_SECONDS = 30


def main(argv=None):
    parser = argparse.ArgumentParser(description="Package 3d_in_blueprints release artifacts.")
    parser.add_argument("--output-dir", type=Path, help="Directory to receive release artifacts.")
    parser.add_argument("--commit", help="Commit stamp to write into release_manifest.json.")
    parser.add_argument("--smoke", action="store_true", help="Run packaging into a temp dir and verify it.")
    args = parser.parse_args(argv)

    if args.smoke:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            manifest = package_release(output_dir, args.commit or "SMOKE")
            verify_release(output_dir, manifest)
            print(f"[PASS] packaging smoke wrote {len(manifest['artifacts'])} artifacts")
        return 0

    if args.output_dir is None:
        parser.error("--output-dir is required unless --smoke is used")

    manifest = package_release(args.output_dir, args.commit or git_commit())
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


def package_release(output_dir, commit):
    output_dir.mkdir(parents=True, exist_ok=True)

    package_version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    addon_version = read_bl_info_version(ROOT / "blender_addon" / "blueprints_addon" / "__init__.py")
    backend_version = read_backend_version(ROOT / "backend" / "src" / "blueprints_backend" / "__init__.py")

    addon_file = f"blueprints_addon-{addon_version}.zip"
    backend_file = f"blueprints_backend-{backend_version}.zip"

    write_zip(
        ROOT / "blender_addon" / "blueprints_addon",
        output_dir / addon_file,
        "blueprints_addon",
    )
    write_zip(
        ROOT / "backend" / "src" / "blueprints_backend",
        output_dir / backend_file,
        "blueprints_backend",
    )

    manifest = {
        "artifacts": [
            {
                "file": addon_file,
                "id": "blender_addon_zip",
                "source": "blender_addon/blueprints_addon",
                "version": addon_version,
            },
            {
                "file": backend_file,
                "id": "backend_bundle_zip",
                "source": "backend/src/blueprints_backend",
                "version": backend_version,
            },
        ],
        "commit": commit,
        "generated_by": "scripts/package_release.py",
        "package_version": package_version,
        "schema_version": "1.0",
    }
    (output_dir / "release_manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def write_zip(source_root, zip_path, archive_root):
    with zipfile.ZipFile(zip_path, "w") as archive:
        for source_file in iter_source_files(source_root):
            rel = source_file.relative_to(source_root)
            archive_name = PurePosixPath(archive_root, *rel.parts).as_posix()
            info = zipfile.ZipInfo(archive_name, date_time=ZIP_EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, source_file.read_bytes())


def iter_source_files(source_root):
    for source_file in sorted(source_root.rglob("*")):
        if source_file.is_dir():
            continue
        rel_parts = source_file.relative_to(source_root).parts
        if "__pycache__" in rel_parts:
            continue
        if source_file.suffix in {".pyc", ".pyo"}:
            continue
        yield source_file


def read_bl_info_version(path):
    module = ast.parse(path.read_text(encoding="utf-8"))
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "bl_info" for target in node.targets):
            continue
        bl_info = ast.literal_eval(node.value)
        return ".".join(str(part) for part in bl_info["version"])
    raise ValueError(f"bl_info version not found in {path}")


def read_backend_version(path):
    module = ast.parse(path.read_text(encoding="utf-8"))
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "__version__" for target in node.targets):
            continue
        return ast.literal_eval(node.value)
    raise ValueError(f"__version__ not found in {path}")


def git_commit():
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return "unknown"


def verify_release(output_dir, manifest):
    artifacts = {artifact["id"]: artifact for artifact in manifest["artifacts"]}
    expected = {
        "blender_addon_zip": [
            "blueprints_addon/__init__.py",
            "blueprints_addon/bridge.py",
            "blueprints_addon/operator_flow.py",
            "blueprints_addon/preview.py",
        ],
        "backend_bundle_zip": [
            "blueprints_backend/__init__.py",
            "blueprints_backend/cli.py",
            "blueprints_backend/data/standards_fasteners.json",
        ],
    }
    for artifact_id, required_names in expected.items():
        artifact = artifacts[artifact_id]
        zip_path = output_dir / artifact["file"]
        if not zip_path.exists():
            raise AssertionError(f"missing artifact: {zip_path}")
        with zipfile.ZipFile(zip_path) as archive:
            names = set(archive.namelist())
        for required_name in required_names:
            if required_name not in names:
                raise AssertionError(f"{artifact_id} missing {required_name}")
        if any("__pycache__" in name for name in names):
            raise AssertionError(f"{artifact_id} contains __pycache__")

    backend_zip = output_dir / artifacts["backend_bundle_zip"]["file"]
    verify_backend_runtime(backend_zip)


def verify_backend_runtime(zip_path):
    with tempfile.TemporaryDirectory(prefix="blueprints-backend-smoke-") as temp_dir:
        smoke_root = Path(temp_dir).resolve()
        checkout_root = ROOT.resolve()
        if path_is_within(smoke_root, checkout_root):
            raise AssertionError("backend bundle runtime smoke must run outside the checkout")

        extracted_backend_root = smoke_root / "extracted-backend"
        job_dir = (smoke_root / "job").resolve()
        extracted_backend_root.mkdir()
        job_dir.mkdir()

        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(extracted_backend_root)

        (job_dir / "job.json").write_text(
            json.dumps(backend_smoke_job(), allow_nan=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        env = os.environ.copy()
        env.pop("PYTHONPATH", None)
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "blueprints_backend",
                    str(job_dir),
                ],
                cwd=extracted_backend_root,
                env=env,
                capture_output=True,
                text=True,
                timeout=BACKEND_SMOKE_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise AssertionError(
                f"backend bundle runtime smoke failed: timed out after {BACKEND_SMOKE_TIMEOUT_SECONDS} seconds"
            ) from exc

        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "no subprocess output"
            raise AssertionError(
                f"backend bundle runtime smoke failed with exit code {result.returncode}: {detail}"
            )

        expected_outputs = {
            "diagnostics": "diagnostics.json",
            "drawing_ir": "drawing_ir.json",
            "svg": "sheet.svg",
        }
        output_paths = {
            output_id: job_dir / filename
            for output_id, filename in expected_outputs.items()
        }
        for output_id, output_path in output_paths.items():
            if not output_path.is_file() or output_path.stat().st_size == 0:
                raise AssertionError(f"backend bundle runtime smoke failed: missing {output_id} output")

        try:
            diagnostics = json.loads(output_paths["diagnostics"].read_text(encoding="utf-8"))
            drawing_ir = json.loads(output_paths["drawing_ir"].read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise AssertionError(f"backend bundle runtime smoke failed: invalid JSON output: {exc}") from exc

        if (
            not isinstance(diagnostics, dict)
            or diagnostics.get("schema_version") != "1.0"
            or diagnostics.get("status") != "ok"
            or diagnostics.get("errors") != []
            or diagnostics.get("outputs") != expected_outputs
        ):
            raise AssertionError("backend bundle runtime smoke failed: diagnostics did not report success")
        if (
            not isinstance(drawing_ir, dict)
            or drawing_ir.get("schema_version") != "1.0"
            or drawing_ir.get("source_job_id") != "release-runtime-smoke"
            or not drawing_ir.get("views")
        ):
            raise AssertionError("backend bundle runtime smoke failed: drawing_ir output is incomplete")


def backend_smoke_job():
    return {
        "job_id": "release-runtime-smoke",
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
                        "end_mm": [40, 0],
                        "id": "runtime-edge",
                        "layer": "visible",
                        "start_mm": [0, 0],
                        "type": "line",
                    }
                ],
                "id": "front",
                "label": "Front",
                "origin_mm": [20, 30],
                "scale": 1,
            }
        ],
    }


def path_is_within(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    raise SystemExit(main())
