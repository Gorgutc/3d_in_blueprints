import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]


class PackagingTests(unittest.TestCase):
    def test_release_packaging_writes_versioned_addon_backend_zips_and_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"

            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "package_release.py"),
                    "--output-dir",
                    str(output_dir),
                    "--commit",
                    "TESTSHA",
                ],
                cwd=ROOT,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(0, result.returncode, result.stderr)
            manifest = json.loads((output_dir / "release_manifest.json").read_text(encoding="utf-8"))
            self.assertEqual("1.0", manifest["schema_version"])
            self.assertEqual("0.1.0", manifest["package_version"])
            self.assertEqual("TESTSHA", manifest["commit"])

            artifacts = {artifact["id"]: artifact for artifact in manifest["artifacts"]}
            addon_artifact = artifacts["blender_addon_zip"]
            backend_artifact = artifacts["backend_bundle_zip"]
            self.assertEqual("0.2.1", addon_artifact["version"])
            self.assertEqual("0.1.1", backend_artifact["version"])

            addon_zip = output_dir / addon_artifact["file"]
            backend_zip = output_dir / backend_artifact["file"]
            self.assertTrue(addon_zip.exists())
            self.assertTrue(backend_zip.exists())

            addon_names = zip_names(addon_zip)
            self.assertIn("blueprints_addon/__init__.py", addon_names)
            self.assertIn("blueprints_addon/bridge.py", addon_names)
            self.assertIn("blueprints_addon/operator_flow.py", addon_names)
            self.assertIn("blueprints_addon/preview.py", addon_names)

            backend_names = zip_names(backend_zip)
            self.assertIn("blueprints_backend/__init__.py", backend_names)
            self.assertIn("blueprints_backend/cli.py", backend_names)
            self.assertIn("blueprints_backend/data/standards_fasteners.json", backend_names)

            packed_names = addon_names + backend_names
            self.assertFalse(any("__pycache__" in name for name in packed_names))
            self.assertFalse(any(name.startswith("backend/tests/") for name in packed_names))
            self.assertFalse(any(name.endswith("diagnostics.json") for name in packed_names))

    def test_verify_release_rejects_backend_zip_that_cannot_run(self):
        package_release = load_package_release_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            manifest = package_release.package_release(output_dir, "TESTSHA")
            artifacts = {artifact["id"]: artifact for artifact in manifest["artifacts"]}
            backend_zip = output_dir / artifacts["backend_bundle_zip"]["file"]
            rewrite_zip_without_member(backend_zip, "blueprints_backend/job.py")

            with self.assertRaisesRegex(AssertionError, "runtime smoke failed"):
                package_release.verify_release(output_dir, manifest)

    def test_verify_release_runs_backend_from_extracted_zip(self):
        package_release = load_package_release_module()
        real_run = package_release.subprocess.run
        calls = []

        def capture_run(command, **kwargs):
            calls.append((command, kwargs))
            return real_run(command, **kwargs)

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            manifest = package_release.package_release(output_dir, "TESTSHA")
            with mock.patch.object(package_release.subprocess, "run", side_effect=capture_run):
                package_release.verify_release(output_dir, manifest)

        self.assertEqual(1, len(calls))
        command, kwargs = calls[0]
        self.assertEqual([sys.executable, "-m", "blueprints_backend"], command[:3])
        self.assertTrue(Path(command[3]).is_absolute())
        self.assertFalse(path_is_within(Path(kwargs["cwd"]).resolve(), ROOT.resolve()))
        self.assertNotIn("PYTHONPATH", kwargs["env"])
        self.assertEqual("1", kwargs["env"]["PYTHONDONTWRITEBYTECODE"])
        self.assertEqual(package_release.BACKEND_SMOKE_TIMEOUT_SECONDS, kwargs["timeout"])


def zip_names(path):
    with zipfile.ZipFile(path) as archive:
        return sorted(archive.namelist())


def load_package_release_module():
    script_path = ROOT / "scripts" / "package_release.py"
    spec = importlib.util.spec_from_file_location("blueprints_package_release", script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rewrite_zip_without_member(path, excluded_name):
    rewritten_path = path.with_name(f"{path.stem}-rewritten{path.suffix}")
    with zipfile.ZipFile(path) as source, zipfile.ZipFile(rewritten_path, "w") as target:
        names = source.namelist()
        if excluded_name not in names:
            raise AssertionError(f"test fixture member missing: {excluded_name}")
        for info in source.infolist():
            if info.filename != excluded_name:
                target.writestr(info, source.read(info.filename))
    rewritten_path.replace(path)


def path_is_within(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    unittest.main()
