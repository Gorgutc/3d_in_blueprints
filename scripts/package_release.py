import argparse
import ast
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
ZIP_EPOCH = (2026, 1, 1, 0, 0, 0)
BACKEND_SMOKE_TIMEOUT_SECONDS = 30
COMPONENT_ROOTS = (
    "backend/src/blueprints_backend",
    "blender_addon/blueprints_addon",
)
RELEASE_INPUT_PATHS = (
    *COMPONENT_ROOTS,
    "package.json",
    "scripts/package_release.py",
)
REGULAR_GIT_MODES = {"100644", "100755"}
FULL_COMMIT_PATTERN = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")
GIT_AUTHORITY_ENVIRONMENT_KEYS = {
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CEILING_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_CONFIG",
    "GIT_DIR",
    "GIT_DISCOVERY_ACROSS_FILESYSTEM",
    "GIT_GRAFT_FILE",
    "GIT_IMPLICIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_NAMESPACE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_PREFIX",
    "GIT_QUARANTINE_PATH",
    "GIT_REPLACE_REF_BASE",
    "GIT_SHALLOW_FILE",
    "GIT_WORK_TREE",
}


class ReleasePackagingError(RuntimeError):
    pass


def main(argv=None):
    parser = argparse.ArgumentParser(description="Package 3d_in_blueprints release artifacts.")
    parser.add_argument("--output-dir", type=Path, help="Directory to receive release artifacts.")
    parser.add_argument("--commit", help="Expected current Git commit (assertion only).")
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Package the working tree, verify it, and use a temporary output unless --output-dir is set.",
    )
    args = parser.parse_args(argv)

    if args.smoke and args.commit is not None:
        parser.error("--commit cannot be used with --smoke")

    if args.smoke:
        if args.output_dir is not None:
            try:
                manifest = package_smoke_release(args.output_dir)
                verify_release(args.output_dir, manifest)
            except (OSError, ReleasePackagingError, SyntaxError, ValueError) as exc:
                print(f"[FAIL] Packaging smoke: {exc}", file=sys.stderr)
                return 1
            print(f"[PASS] packaging smoke wrote {len(manifest['artifacts'])} artifacts")
            return 0

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                output_dir = Path(temp_dir) / "release"
                manifest = package_smoke_release(output_dir)
                verify_release(output_dir, manifest)
                print(f"[PASS] packaging smoke wrote {len(manifest['artifacts'])} artifacts")
        except (OSError, ReleasePackagingError, SyntaxError, ValueError) as exc:
            print(f"[FAIL] Packaging smoke: {exc}", file=sys.stderr)
            return 1
        return 0

    if args.output_dir is None:
        parser.error("--output-dir is required unless --smoke is used")

    try:
        manifest = package_release(args.output_dir, args.commit)
    except (OSError, ReleasePackagingError, SyntaxError, ValueError) as exc:
        print(f"[FAIL] Release packaging: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


def package_release(output_dir, expected_commit=None, root=ROOT):
    commit, inventory = read_release_snapshot(expected_commit=expected_commit, root=root)
    return write_release(output_dir, inventory, commit)


def package_smoke_release(output_dir, root=ROOT):
    return write_release(output_dir, read_working_tree_inventory(root), "SMOKE")


def write_release(output_dir, inventory, commit):
    try:
        package_version = json.loads(decode_source(inventory, "package.json"))["version"]
        addon_version = read_bl_info_version_text(
            decode_source(inventory, "blender_addon/blueprints_addon/__init__.py")
        )
        backend_version = read_backend_version_text(
            decode_source(inventory, "backend/src/blueprints_backend/__init__.py")
        )
    except (KeyError, TypeError, json.JSONDecodeError, SyntaxError, ValueError) as exc:
        raise ReleasePackagingError(f"release metadata is invalid: {exc}") from exc

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    addon_file = f"blueprints_addon-{addon_version}.zip"
    backend_file = f"blueprints_backend-{backend_version}.zip"

    write_zip(
        inventory,
        "blender_addon/blueprints_addon",
        output_dir / addon_file,
        "blueprints_addon",
    )
    write_zip(
        inventory,
        "backend/src/blueprints_backend",
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


def write_zip(inventory, source_root, zip_path, archive_root):
    source_prefix = f"{source_root}/"
    with zipfile.ZipFile(zip_path, "w") as archive:
        source_paths = sorted(path for path in inventory if path.startswith(source_prefix))
        for source_path in source_paths:
            relative_path = source_path[len(source_prefix):]
            archive_name = PurePosixPath(archive_root, relative_path).as_posix()
            info = zipfile.ZipInfo(archive_name, date_time=ZIP_EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, inventory[source_path])


def read_release_snapshot(expected_commit=None, root=ROOT):
    root = Path(root)
    if expected_commit is not None and not expected_commit.strip():
        raise ReleasePackagingError("--commit must not be blank")

    validate_repository_authority(root)
    head = resolve_commit(root, "HEAD")
    if expected_commit is not None:
        expected = resolve_commit(root, expected_commit.strip())
        if expected != head:
            raise ReleasePackagingError(
                f"--commit resolved to {expected}, which does not match current HEAD {head}"
            )

    dirty = run_git(
        root,
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--",
        *RELEASE_INPUT_PATHS,
    )
    if dirty:
        raise ReleasePackagingError("release inputs are dirty (staged, unstaged, or untracked)")

    inventory = read_git_inventory(root, head)
    return head, inventory


def resolve_commit(root, revision):
    resolved = run_git(
        root,
        "rev-parse",
        "--verify",
        "--end-of-options",
        f"{revision}^{{commit}}",
    ).decode("ascii", errors="strict").strip()
    if not FULL_COMMIT_PATTERN.fullmatch(resolved):
        raise ReleasePackagingError(f"Git returned an invalid full commit identity: {resolved or '<blank>'}")
    return resolved


def read_git_inventory(root, commit):
    records = run_git(root, "ls-tree", "-r", "-z", "--full-tree", commit)
    entries = {}
    for record in records.split(b"\0"):
        if not record:
            continue
        try:
            metadata, raw_path = record.split(b"\t", 1)
            raw_mode, raw_type, raw_oid = metadata.split(b" ", 2)
            path = raw_path.decode("utf-8", errors="strict")
            mode = raw_mode.decode("ascii", errors="strict")
            object_type = raw_type.decode("ascii", errors="strict")
            oid = raw_oid.decode("ascii", errors="strict")
        except (UnicodeDecodeError, ValueError) as exc:
            raise ReleasePackagingError("Git tree inventory contains an invalid entry") from exc

        if not is_controlled_release_input(path):
            continue
        if object_type != "blob" or mode not in REGULAR_GIT_MODES:
            raise ReleasePackagingError(
                f"unsupported Git tree entry for release input: {mode} {object_type} {path}"
            )
        if (
            path not in {"package.json", "scripts/package_release.py"}
            and not is_packaged_component_path(path)
        ):
            continue
        if path in entries:
            raise ReleasePackagingError(f"duplicate Git tree entry for release input: {path}")
        entries[path] = oid

    required_files = {
        "backend/src/blueprints_backend/__init__.py",
        "blender_addon/blueprints_addon/__init__.py",
        "package.json",
        "scripts/package_release.py",
    }
    missing = sorted(required_files.difference(entries))
    if missing:
        raise ReleasePackagingError(f"Git tree is missing release inputs: {', '.join(missing)}")

    return {
        path: run_git(root, "cat-file", "blob", oid)
        for path, oid in sorted(entries.items())
    }


def validate_repository_authority(root):
    redirected = sorted(
        key
        for key in os.environ
        if is_git_authority_environment_key(key)
    )
    if redirected:
        raise ReleasePackagingError(
            "Git repository authority environment is not allowed: "
            + ", ".join(redirected)
        )

    root = Path(root).resolve(strict=True)
    top_level = decode_git_path(
        run_git(root, "rev-parse", "--show-toplevel"),
        "top-level",
    )
    if top_level.resolve(strict=True) != root:
        raise ReleasePackagingError(
            f"Git top-level does not match release root: {top_level} != {root}"
        )

    reported_git_dir = decode_git_path(
        run_git(root, "rev-parse", "--absolute-git-dir"),
        "directory",
    ).resolve(strict=False)
    expected_git_dir = checkout_git_dir(root)
    if reported_git_dir != expected_git_dir:
        raise ReleasePackagingError(
            "Git directory does not match release checkout: "
            f"{reported_git_dir} != {expected_git_dir}"
        )


def is_git_authority_environment_key(key):
    normalized = key.upper()
    return (
        normalized in GIT_AUTHORITY_ENVIRONMENT_KEYS
        or normalized.startswith("GIT_CONFIG_")
    )


def decode_git_path(raw_path, label):
    try:
        value = raw_path.decode("utf-8", errors="strict").strip()
    except UnicodeDecodeError as exc:
        raise ReleasePackagingError(f"Git returned an invalid {label} path") from exc
    if not value:
        raise ReleasePackagingError(f"Git returned a blank {label} path")
    return Path(value)


def checkout_git_dir(root):
    dot_git = root / ".git"
    if dot_git.is_dir():
        return dot_git.resolve(strict=True)
    if not dot_git.is_file():
        raise ReleasePackagingError(f"release root has no .git checkout metadata: {root}")
    try:
        marker = dot_git.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError) as exc:
        raise ReleasePackagingError("release checkout .git metadata is unreadable") from exc
    match = re.fullmatch(r"gitdir:\s*(.+)", marker, flags=re.IGNORECASE)
    if match is None:
        raise ReleasePackagingError("release checkout .git metadata is invalid")
    configured = Path(match.group(1))
    if not configured.is_absolute():
        configured = dot_git.parent / configured
    try:
        return configured.resolve(strict=True)
    except OSError as exc:
        raise ReleasePackagingError("release checkout Git directory is unavailable") from exc


def is_controlled_release_input(path):
    return path in {"package.json", "scripts/package_release.py"} or any(
        path.startswith(f"{component_root}/") for component_root in COMPONENT_ROOTS
    )


def is_packaged_component_path(path):
    if not any(path.startswith(f"{component_root}/") for component_root in COMPONENT_ROOTS):
        return False
    parts = PurePosixPath(path).parts
    return "__pycache__" not in parts and PurePosixPath(path).suffix not in {".pyc", ".pyo"}


def read_working_tree_inventory(root=ROOT):
    root = Path(root)
    inventory = {
        "package.json": (root / "package.json").read_bytes(),
        "scripts/package_release.py": (root / "scripts" / "package_release.py").read_bytes(),
    }
    for component_root in COMPONENT_ROOTS:
        for source_file in sorted((root / Path(component_root)).rglob("*")):
            if source_file.is_dir():
                continue
            relative_path = source_file.relative_to(root).as_posix()
            if not is_packaged_component_path(relative_path):
                continue
            inventory[relative_path] = source_file.read_bytes()
    return inventory


def run_git(root, *args):
    git_env = {
        key: value
        for key, value in os.environ.items()
        if not key.upper().startswith("GIT_")
    }
    git_env.update({
        "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_TERMINAL_PROMPT": "0",
    })
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            env=git_env,
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        raise ReleasePackagingError(f"Git is unavailable: {exc}") from exc
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        if not detail:
            detail = result.stdout.decode("utf-8", errors="replace").strip()
        raise ReleasePackagingError(
            f"Git command failed ({' '.join(args)}): {detail or f'exit code {result.returncode}'}"
        )
    return result.stdout


def read_bl_info_version_text(source):
    module = ast.parse(source)
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "bl_info" for target in node.targets):
            continue
        bl_info = ast.literal_eval(node.value)
        return ".".join(str(part) for part in bl_info["version"])
    raise ValueError("bl_info version not found")


def read_backend_version_text(source):
    module = ast.parse(source)
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "__version__" for target in node.targets):
            continue
        return ast.literal_eval(node.value)
    raise ValueError("__version__ not found")


def decode_source(inventory, path):
    try:
        return inventory[path].decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise ReleasePackagingError(f"release input is not UTF-8: {path}") from exc


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
