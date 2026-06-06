import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


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
            self.assertEqual("0.2.0", addon_artifact["version"])
            self.assertEqual("0.1.0", backend_artifact["version"])

            addon_zip = output_dir / addon_artifact["file"]
            backend_zip = output_dir / backend_artifact["file"]
            self.assertTrue(addon_zip.exists())
            self.assertTrue(backend_zip.exists())

            addon_names = zip_names(addon_zip)
            self.assertIn("blueprints_addon/__init__.py", addon_names)
            self.assertIn("blueprints_addon/bridge.py", addon_names)
            self.assertIn("blueprints_addon/preview.py", addon_names)

            backend_names = zip_names(backend_zip)
            self.assertIn("blueprints_backend/__init__.py", backend_names)
            self.assertIn("blueprints_backend/cli.py", backend_names)
            self.assertIn("blueprints_backend/data/standards_fasteners.json", backend_names)

            packed_names = addon_names + backend_names
            self.assertFalse(any("__pycache__" in name for name in packed_names))
            self.assertFalse(any(name.startswith("backend/tests/") for name in packed_names))
            self.assertFalse(any(name.endswith("diagnostics.json") for name in packed_names))


def zip_names(path):
    with zipfile.ZipFile(path) as archive:
        return sorted(archive.namelist())


if __name__ == "__main__":
    unittest.main()
