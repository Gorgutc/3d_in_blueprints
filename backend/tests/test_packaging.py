import contextlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]


class PackagingTests(unittest.TestCase):
    def test_release_uses_full_head_and_exact_git_blob_bytes(self):
        with release_fixture() as fixture:
            committed_backend = git_bytes(
                fixture,
                "cat-file",
                "blob",
                "HEAD:backend/src/blueprints_backend/__init__.py",
            )
            backend_init = fixture / "backend" / "src" / "blueprints_backend" / "__init__.py"
            backend_init.unlink()
            git(fixture, "checkout", "--", backend_init.relative_to(fixture).as_posix())
            self.assertNotEqual(committed_backend, backend_init.read_bytes())
            self.assertEqual(
                b"",
                git_bytes(
                    fixture,
                    "status",
                    "--porcelain=v1",
                    "--",
                    backend_init.relative_to(fixture).as_posix(),
                ),
            )

            output_dir = fixture / "release"
            result = run_packager(fixture, "--output-dir", str(output_dir))

            self.assertEqual(0, result.returncode, result.stderr)
            manifest = read_manifest(output_dir)
            self.assertEqual(git_text(fixture, "rev-parse", "HEAD"), manifest["commit"])
            self.assertRegex(manifest["commit"], r"^[0-9a-f]{40,64}$")
            self.assertEqual("1.0", manifest["schema_version"])
            self.assertEqual("9.8.7", manifest["package_version"])
            artifacts = {artifact["id"]: artifact for artifact in manifest["artifacts"]}
            self.assertEqual("1.2.3", artifacts["blender_addon_zip"]["version"])
            self.assertEqual("4.5.6", artifacts["backend_bundle_zip"]["version"])
            backend_zip = output_dir / artifacts["backend_bundle_zip"]["file"]
            with zipfile.ZipFile(backend_zip) as archive:
                self.assertEqual(
                    committed_backend,
                    archive.read("blueprints_backend/__init__.py"),
                )

    def test_release_ignores_git_replacement_refs_for_head_payload(self):
        with release_fixture() as fixture:
            original_branch = git_text(fixture, "branch", "--show-current")
            original_head = git_text(fixture, "rev-parse", "HEAD")
            original_backend = git_bytes(
                fixture,
                "cat-file",
                "blob",
                "HEAD:backend/src/blueprints_backend/__init__.py",
            )
            git(fixture, "switch", "-c", "replacement-payload")
            backend_init = fixture / "backend" / "src" / "blueprints_backend" / "__init__.py"
            backend_init.write_bytes(b'__version__ = "7.7.7"\n')
            git(fixture, "add", backend_init.relative_to(fixture).as_posix())
            git(fixture, "commit", "-m", "replacement payload")
            replacement_commit = git_text(fixture, "rev-parse", "HEAD")
            git(fixture, "switch", original_branch)
            git(fixture, "replace", original_head, replacement_commit)

            output_dir = fixture / "release-no-replacements"
            result = run_packager(fixture, "--output-dir", str(output_dir))

            self.assertEqual(0, result.returncode, result.stderr)
            manifest = read_manifest(output_dir)
            self.assertEqual(original_head, manifest["commit"])
            artifacts = {artifact["id"]: artifact for artifact in manifest["artifacts"]}
            self.assertEqual("4.5.6", artifacts["backend_bundle_zip"]["version"])
            with zipfile.ZipFile(output_dir / artifacts["backend_bundle_zip"]["file"]) as archive:
                self.assertEqual(
                    original_backend,
                    archive.read("blueprints_backend/__init__.py"),
                )

    def test_release_accepts_commit_assertion_only_when_it_resolves_to_head(self):
        with release_fixture() as fixture:
            head = git_text(fixture, "rev-parse", "HEAD")
            accepted_output = fixture / "accepted"

            accepted = run_packager(
                fixture,
                "--output-dir",
                str(accepted_output),
                "--commit",
                "HEAD",
            )

            self.assertEqual(0, accepted.returncode, accepted.stderr)
            self.assertEqual(head, read_manifest(accepted_output)["commit"])

            (fixture / "outside.txt").write_text("outside\n", encoding="utf-8")
            git(fixture, "add", "outside.txt")
            git(fixture, "commit", "-m", "advance head")
            rejected_output = fixture / "rejected"
            rejected = run_packager(
                fixture,
                "--output-dir",
                str(rejected_output),
                "--commit",
                head,
            )

            self.assertNotEqual(0, rejected.returncode)
            self.assertIn("does not match current HEAD", rejected.stderr)
            self.assertFalse(rejected_output.exists())

    def test_release_rejects_blank_unresolved_and_unavailable_git_before_output(self):
        with release_fixture() as fixture:
            cases = [
                ("blank", ["--commit", ""], None),
                ("unresolved", ["--commit", "not-a-real-commit"], None),
                ("git-unavailable", [], {**os.environ, "PATH": ""}),
            ]
            for label, extra_args, env in cases:
                with self.subTest(label=label):
                    output_dir = fixture / f"release-{label}"
                    result = run_packager(
                        fixture,
                        "--output-dir",
                        str(output_dir),
                        *extra_args,
                        env=env,
                    )
                    self.assertNotEqual(0, result.returncode)
                    self.assertFalse(output_dir.exists())

    def test_release_rejects_empty_git_identity_before_output(self):
        package_release = load_package_release_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / ".git").mkdir()
            output_dir = root / "release"
            git_responses = [
                str(root).encode(),
                str(root / ".git").encode(),
                b"",
            ]
            with mock.patch.object(package_release, "run_git", side_effect=git_responses):
                with self.assertRaisesRegex(
                    package_release.ReleasePackagingError,
                    "invalid full commit identity",
                ):
                    package_release.package_release(output_dir, root=root)
            self.assertFalse(output_dir.exists())

    def test_release_rejects_repository_authority_environment_before_output(self):
        with release_fixture() as fixture, tempfile.TemporaryDirectory() as attacker_temp:
            attacker = Path(attacker_temp) / "attacker"
            shutil.copytree(fixture, attacker)
            output_dir = fixture / "release-redirected"
            env = {
                **os.environ,
                "PYTHONDONTWRITEBYTECODE": "1",
                "GIT_DIR": str(attacker / ".git"),
                "GIT_WORK_TREE": str(attacker),
            }

            result = run_packager(
                fixture,
                "--output-dir",
                str(output_dir),
                env=env,
            )

            self.assertNotEqual(0, result.returncode)
            self.assertIn("Git repository authority environment", result.stderr)
            self.assertFalse(output_dir.exists())

    def test_release_rejects_git_top_level_and_git_dir_mismatch_before_output(self):
        package_release = load_package_release_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "repo"
            root.mkdir()
            (root / ".git").mkdir()
            for label, responses, expected_error in [
                (
                    "top-level",
                    [str(root.parent).encode()],
                    "Git top-level does not match release root",
                ),
                (
                    "git-dir",
                    [str(root).encode(), str(root.parent / ".git").encode()],
                    "Git directory does not match release checkout",
                ),
            ]:
                with self.subTest(label=label):
                    output_dir = root / f"release-{label}"
                    with mock.patch.object(package_release, "run_git", side_effect=responses):
                        with self.assertRaisesRegex(
                            package_release.ReleasePackagingError,
                            expected_error,
                        ):
                            package_release.package_release(output_dir, root=root)
                    self.assertFalse(output_dir.exists())

    def test_release_rejects_staged_unstaged_and_untracked_component_changes(self):
        cases = {
            "staged": self._make_staged_change,
            "unstaged": self._make_unstaged_change,
            "untracked": self._make_untracked_change,
        }
        for label, mutate in cases.items():
            with self.subTest(label=label), release_fixture() as fixture:
                mutate(fixture)
                output_dir = fixture / "release"

                result = run_packager(fixture, "--output-dir", str(output_dir))

                self.assertNotEqual(0, result.returncode)
                self.assertIn("release inputs are dirty", result.stderr)
                self.assertFalse(output_dir.exists())

    def test_release_rejects_nonregular_component_tree_entry_before_output(self):
        paths = [
            "backend/src/blueprints_backend/link.py",
            "backend/src/blueprints_backend/__pycache__/link.pyc",
        ]
        for synthetic_path in paths:
            with self.subTest(path=synthetic_path), release_fixture() as fixture:
                link_oid = git_text(
                    fixture,
                    "hash-object",
                    "-w",
                    "--stdin",
                    input_text="target.py\n",
                )
                git(
                    fixture,
                    "update-index",
                    "--add",
                    "--cacheinfo",
                    "120000",
                    link_oid,
                    synthetic_path,
                )
                git(fixture, "commit", "-m", "add synthetic symlink")
                git(fixture, "checkout", "-f", "HEAD")
                self.assertEqual(b"", git_bytes(fixture, "status", "--porcelain=v1"))
                output_dir = fixture / "release"

                result = run_packager(fixture, "--output-dir", str(output_dir))

                self.assertNotEqual(0, result.returncode)
                self.assertIn("unsupported Git tree entry", result.stderr)
                self.assertFalse(output_dir.exists())

    def test_release_excludes_committed_python_cache_artifacts(self):
        with release_fixture() as fixture:
            cache_file = (
                fixture
                / "backend"
                / "src"
                / "blueprints_backend"
                / "__pycache__"
                / "stale.pyc"
            )
            cache_file.parent.mkdir()
            cache_file.write_bytes(b"not-bytecode")
            optimized_file = cache_file.parent.parent / "legacy.pyo"
            optimized_file.write_bytes(b"not-bytecode")
            git(
                fixture,
                "add",
                cache_file.relative_to(fixture).as_posix(),
                optimized_file.relative_to(fixture).as_posix(),
            )
            git(fixture, "commit", "-m", "add committed cache artifacts")
            output_dir = fixture / "release"

            result = run_packager(fixture, "--output-dir", str(output_dir))

            self.assertEqual(0, result.returncode, result.stderr)
            artifacts = {artifact["id"]: artifact for artifact in read_manifest(output_dir)["artifacts"]}
            names = zip_names(output_dir / artifacts["backend_bundle_zip"]["file"])
            self.assertFalse(any("__pycache__" in name for name in names))
            self.assertFalse(any(name.endswith((".pyc", ".pyo")) for name in names))

    def test_smoke_with_output_is_persistent_working_tree_build_with_sentinel(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"

            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "package_release.py"),
                    "--smoke",
                    "--output-dir",
                    str(output_dir),
                ],
                cwd=ROOT,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual("SMOKE", read_manifest(output_dir)["commit"])
            self.assertTrue(any(output_dir.glob("*.zip")))

    def test_smoke_without_output_is_temporary_and_rejects_commit(self):
        temporary = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "package_release.py"), "--smoke"],
            cwd=ROOT,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(0, temporary.returncode, temporary.stderr)
        self.assertIn("[PASS] packaging smoke wrote 2 artifacts", temporary.stdout)

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            rejected = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "package_release.py"),
                    "--smoke",
                    "--output-dir",
                    str(output_dir),
                    "--commit",
                    "HEAD",
                ],
                cwd=ROOT,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(0, rejected.returncode)
            self.assertFalse(output_dir.exists())

    def test_verify_release_rejects_backend_zip_that_cannot_run(self):
        package_release = load_package_release_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            manifest = package_release.package_smoke_release(output_dir)
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
            manifest = package_release.package_smoke_release(output_dir)
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

    @staticmethod
    def _make_staged_change(fixture):
        path = fixture / "package.json"
        path.write_text(path.read_text(encoding="utf-8") + " ", encoding="utf-8")
        git(fixture, "add", "package.json")

    @staticmethod
    def _make_unstaged_change(fixture):
        path = fixture / "blender_addon" / "blueprints_addon" / "__init__.py"
        path.write_text(path.read_text(encoding="utf-8") + "# dirty\n", encoding="utf-8")

    @staticmethod
    def _make_untracked_change(fixture):
        path = fixture / "backend" / "src" / "blueprints_backend" / "untracked.py"
        path.write_text("UNTRACKED = True\n", encoding="utf-8")


@contextlib.contextmanager
def release_fixture():
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir) / "repo"
        (root / "scripts").mkdir(parents=True)
        (root / "blender_addon" / "blueprints_addon").mkdir(parents=True)
        (root / "backend" / "src" / "blueprints_backend").mkdir(parents=True)
        shutil.copyfile(ROOT / "scripts" / "package_release.py", root / "scripts" / "package_release.py")
        (root / "package.json").write_bytes(b'{"version":"9.8.7"}\n')
        (root / "blender_addon" / "blueprints_addon" / "__init__.py").write_bytes(
            b'bl_info = {"version": (1, 2, 3)}\n'
        )
        (root / "blender_addon" / "blueprints_addon" / "bridge.py").write_bytes(b"BRIDGE = True\n")
        (root / "backend" / "src" / "blueprints_backend" / "__init__.py").write_bytes(
            b'__version__ = "4.5.6"\n'
        )
        (root / "backend" / "src" / "blueprints_backend" / "cli.py").write_bytes(b"CLI = True\n")
        git(root, "init")
        git(root, "config", "user.email", "fixture@example.invalid")
        git(root, "config", "user.name", "Packaging Fixture")
        git(root, "config", "core.autocrlf", "true")
        git(root, "config", "core.symlinks", "false")
        git(root, "add", ".")
        git(root, "commit", "-m", "fixture")
        yield root


def run_packager(fixture, *args, env=None):
    return subprocess.run(
        [sys.executable, str(fixture / "scripts" / "package_release.py"), *args],
        cwd=fixture,
        env=env or {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True,
        text=True,
        check=False,
    )


def read_manifest(output_dir):
    return json.loads((output_dir / "release_manifest.json").read_text(encoding="utf-8"))


def git(root, *args, input_text=None):
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        input=input_text,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {result.stderr or result.stdout}")
    return result


def git_text(root, *args, input_text=None):
    return git(root, *args, input_text=input_text).stdout.strip()


def git_bytes(root, *args):
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {result.stderr.decode(errors='replace')}")
    return result.stdout


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
