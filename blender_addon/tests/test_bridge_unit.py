import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
BRIDGE_PATH = ROOT / "blender_addon" / "blueprints_addon" / "bridge.py"
BRIDGE_SPEC = importlib.util.spec_from_file_location("blueprints_bridge_under_test", BRIDGE_PATH)
bridge = importlib.util.module_from_spec(BRIDGE_SPEC)
BRIDGE_SPEC.loader.exec_module(bridge)


BACKEND_NOT_CONFIGURED_MESSAGE = (
    "Backend Source is not configured. Extract the backend ZIP and select the folder "
    "containing blueprints_backend in Add-on Preferences."
)


class BridgeUnitTests(unittest.TestCase):
    def test_backend_spawn_failure_writes_diagnostics(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            job_dir = root / "job"
            job_dir.mkdir()
            backend_source = self.make_backend_source(root / "backend-src")
            missing_python = job_dir / "missing-python.exe"

            result = bridge.run_backend(
                job_dir,
                backend_python=str(missing_python),
                backend_src_path=str(backend_source),
                timeout_seconds=1,
            )

            self.assertEqual(127, result.returncode)
            diagnostics = json.loads((job_dir / "diagnostics.json").read_text(encoding="utf-8"))
            self.assertEqual("error", diagnostics["status"])
            self.assertEqual("backend_spawn_failed", diagnostics["errors"][0]["code"])

    def test_success_without_required_outputs_is_marked_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            self.write_diagnostics(
                job_dir,
                status="ok",
                outputs=self.success_output_mapping(),
            )

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual(1, state.returncode)
            self.assertEqual("error", state.diagnostics["status"])
            self.assertEqual("backend_missing_outputs", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )

    def test_backend_job_contains_scene_source_not_drawing_entities(self):
        payload = bridge.build_backend_job(
            {
                "objects": [
                    {
                        "id": "Cube",
                    }
                ],
                "scene_name": "Scene",
            },
            Path("scene.obj"),
        )

        self.assertNotIn("views", payload)
        self.assertEqual("GOST", payload["sheet"]["standard"])
        self.assertEqual("Scene", payload["sheet"]["title_block"]["title"])
        self.assertEqual("scene_snapshot.json", payload["source"]["scene_snapshot"])
        self.assertEqual("scene.obj", payload["source"]["assets"]["scene"])

    def test_run_bridge_binds_output_validation_to_submitted_job_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            asset_path = job_dir / "scene.obj"
            backend_job = {"job_id": "submitted-job", "schema_version": "1.0"}
            backend_process = bridge.subprocess.CompletedProcess(
                ["python"],
                0,
                "backend stdout",
                "backend stderr",
            )
            output_state = bridge.BackendOutputState(
                diagnostics={"status": "ok"},
                returncode=0,
                approved_outputs={"diagnostics": job_dir / "diagnostics.json"},
            )
            with (
                mock.patch.object(bridge, "create_job_dir", return_value=job_dir),
                mock.patch.object(
                    bridge,
                    "scene_snapshot",
                    return_value={"scene_name": "Scene"},
                ),
                mock.patch.object(bridge, "write_json"),
                mock.patch.object(bridge, "export_scene_asset", return_value=asset_path),
                mock.patch.object(bridge, "build_backend_job", return_value=backend_job),
                mock.patch.object(bridge, "run_backend", return_value=backend_process),
                mock.patch.object(
                    bridge,
                    "ensure_backend_outputs",
                    return_value=output_state,
                ) as ensure_outputs,
            ):
                result = bridge.run_bridge(None, None)

            ensure_outputs.assert_called_once_with(
                job_dir,
                0,
                expected_job_id="submitted-job",
            )
            self.assertEqual(output_state.approved_outputs, result.approved_outputs)

    def test_explicit_backend_source_requires_package_entrypoints(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            valid_source = self.make_backend_source(root / "valid")
            incomplete_source = root / "incomplete"
            (incomplete_source / "blueprints_backend").mkdir(parents=True)
            (incomplete_source / "blueprints_backend" / "__init__.py").write_text(
                "", encoding="utf-8"
            )

            self.assertEqual(
                valid_source.resolve(),
                bridge.resolve_backend_source(str(valid_source)),
            )
            with self.assertRaises(bridge.BridgeConfigurationError) as raised:
                bridge.resolve_backend_source(str(incomplete_source))

            self.assertEqual("backend_not_configured", raised.exception.code)
            self.assertEqual(BACKEND_NOT_CONFIGURED_MESSAGE, str(raised.exception))

    def test_blank_backend_source_only_discovers_a_source_checkout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            backend_source = self.make_backend_source(root / "checkout" / "backend" / "src")
            bridge_path = root / "checkout" / "blender_addon" / "blueprints_addon" / "bridge.py"
            bridge_path.parent.mkdir(parents=True)
            bridge_path.write_text("# installed for test\n", encoding="utf-8")

            self.assertEqual(
                backend_source.resolve(),
                bridge.resolve_backend_source("", bridge_path=bridge_path),
            )

    def test_blank_backend_source_in_installed_addon_is_actionable_typed_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            bridge_path = Path(temp_dir) / "blueprints_addon" / "bridge.py"
            bridge_path.parent.mkdir()
            bridge_path.write_text("# installed for test\n", encoding="utf-8")

            with self.assertRaises(bridge.BridgeConfigurationError) as raised:
                bridge.resolve_backend_source(None, bridge_path=bridge_path)

            self.assertEqual("backend_not_configured", raised.exception.code)
            self.assertEqual(BACKEND_NOT_CONFIGURED_MESSAGE, raised.exception.message)
            self.assertEqual(BACKEND_NOT_CONFIGURED_MESSAGE, str(raised.exception))

    def test_backend_launch_uses_trusted_source_cwd_and_absolute_job_argument(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            backend_source = self.make_backend_source(
                root / "trusted-source",
                main_source=(
                    "import json\n"
                    "import sys\n"
                    "from pathlib import Path\n"
                    "job_dir = Path(sys.argv[1])\n"
                    "(job_dir / 'launch.json').write_text(\n"
                    "    json.dumps({'runner': 'trusted', 'job_is_absolute': job_dir.is_absolute()}),\n"
                    "    encoding='utf-8',\n"
                    ")\n"
                ),
            )
            job_dir = root / "job"
            malicious_package = job_dir / "blueprints_backend"
            malicious_package.mkdir(parents=True)
            (malicious_package / "__init__.py").write_text("", encoding="utf-8")
            (malicious_package / "__main__.py").write_text(
                "from pathlib import Path\n"
                "Path('malicious-ran.txt').write_text('pwned', encoding='utf-8')\n",
                encoding="utf-8",
            )

            result = bridge.run_backend(
                job_dir,
                backend_python="",
                backend_src_path=backend_source,
                timeout_seconds=5,
            )

            self.assertEqual(0, result.returncode, result.stderr)
            launch = json.loads((job_dir / "launch.json").read_text(encoding="utf-8"))
            self.assertEqual({"job_is_absolute": True, "runner": "trusted"}, launch)
            self.assertFalse((backend_source / "malicious-ran.txt").exists())
            self.assertFalse((job_dir / "malicious-ran.txt").exists())

    def test_valid_success_returns_only_schema_approved_outputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            warnings = [
                {
                    "code": "projection_pending",
                    "message": "Projection remains pending.",
                    "source": "scene_snapshot.json",
                }
            ]
            self.write_success_outputs(job_dir, warnings=warnings, with_overlay=True)
            (job_dir / "untrusted.txt").write_text("not declared", encoding="utf-8")

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual(0, state.returncode)
            self.assertEqual("ok", state.diagnostics["status"])
            self.assertEqual("projection_pending", state.diagnostics["warnings"][0]["code"])
            self.assertEqual(
                {
                    "diagnostics": job_dir / "diagnostics.json",
                    "drawing_ir": job_dir / "drawing_ir.json",
                    "image_assist_overlay": job_dir / "assist_overlay.svg",
                    "svg": job_dir / "sheet.svg",
                },
                state.approved_outputs,
            )

    def test_diagnostics_requires_strict_utf8_json_object(self):
        invalid_payloads = {
            "empty": b"",
            "invalid_utf8": b"\xff\xfe",
            "array": b"[]\n",
            "duplicate_key": (
                b'{"schema_version":"1.0","status":"ok","status":"error",'
                b'"errors":[],"warnings":[],"outputs":{}}\n'
            ),
            "nonfinite": (
                b'{"schema_version":"1.0","status":"ok","errors":[],"warnings":[],"outputs":{},'
                b'"extra":NaN}\n'
            ),
        }
        for label, raw in invalid_payloads.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                (job_dir / "diagnostics.json").write_bytes(raw)

                state = bridge.ensure_backend_outputs(job_dir, 0, "job")

                self.assertEqual(1, state.returncode)
                self.assertEqual("backend_invalid_diagnostics", state.diagnostics["errors"][0]["code"])
                self.assertEqual(
                    {"diagnostics": job_dir / "diagnostics.json"},
                    state.approved_outputs,
                )
                message = state.diagnostics["errors"][0]["message"]
                self.assertNotIn("JSONDecodeError", message)
                self.assertNotIn("UnicodeDecodeError", message)

    def test_diagnostics_file_must_be_regular_nonempty_and_not_a_symlink(self):
        with tempfile.TemporaryDirectory() as directory_temp:
            job_dir = Path(directory_temp)
            (job_dir / "diagnostics.json").mkdir()

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual("backend_invalid_diagnostics", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )
            self.assertTrue((job_dir / "diagnostics.json").is_file())

        with tempfile.TemporaryDirectory() as symlink_temp:
            root = Path(symlink_temp)
            job_dir = root / "job"
            job_dir.mkdir()
            outside = root / "outside-diagnostics.json"
            outside.write_text("{}\n", encoding="utf-8")
            try:
                (job_dir / "diagnostics.json").symlink_to(outside)
            except OSError as exc:
                self.skipTest(f"Symlink creation is unavailable: {exc}")

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual("backend_invalid_diagnostics", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )
            self.assertFalse((job_dir / "diagnostics.json").is_symlink())
            self.assertEqual("{}\n", outside.read_text(encoding="utf-8"))

    def test_diagnostics_shape_and_status_payload_must_be_consistent(self):
        invalid_payloads = {
            "schema": {
                "errors": [],
                "outputs": {},
                "schema_version": "2.0",
                "status": "ok",
                "warnings": [],
            },
            "status": {
                "errors": [],
                "outputs": {},
                "schema_version": "1.0",
                "status": "maybe",
                "warnings": [],
            },
            "errors_shape": {
                "errors": {},
                "outputs": {},
                "schema_version": "1.0",
                "status": "error",
                "warnings": [],
            },
            "warnings_shape": {
                "errors": [],
                "outputs": {},
                "schema_version": "1.0",
                "status": "ok",
                "warnings": ["raw warning"],
            },
            "outputs_shape": {
                "errors": [],
                "outputs": [],
                "schema_version": "1.0",
                "status": "ok",
                "warnings": [],
            },
            "ok_with_errors": {
                "errors": [{"code": "bad", "message": "bad"}],
                "outputs": self.success_output_mapping(),
                "schema_version": "1.0",
                "status": "ok",
                "warnings": [],
            },
            "error_without_errors": {
                "errors": [],
                "outputs": {},
                "schema_version": "1.0",
                "status": "error",
                "warnings": [],
            },
            "error_empty_code": {
                "errors": [{"code": "", "message": "bad"}],
                "outputs": {},
                "schema_version": "1.0",
                "status": "error",
                "warnings": [],
            },
            "error_nonstring_message": {
                "errors": [{"code": "bad", "message": 7}],
                "outputs": {},
                "schema_version": "1.0",
                "status": "error",
                "warnings": [],
            },
            "warning_empty_message": {
                "errors": [],
                "outputs": self.success_output_mapping(),
                "schema_version": "1.0",
                "status": "ok",
                "warnings": [{"code": "warning", "message": ""}],
            },
            "warning_nonstring_code": {
                "errors": [],
                "outputs": self.success_output_mapping(),
                "schema_version": "1.0",
                "status": "ok",
                "warnings": [{"code": 7, "message": "warning"}],
            },
        }
        for label, payload in invalid_payloads.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                bridge.write_json(job_dir / "diagnostics.json", payload)

                state = bridge.ensure_backend_outputs(
                    job_dir,
                    0 if payload["status"] != "error" else 1,
                    "job",
                )

                self.assertEqual("backend_invalid_diagnostics", state.diagnostics["errors"][0]["code"])
                self.assertEqual(
                    {"diagnostics": job_dir / "diagnostics.json"},
                    state.approved_outputs,
                )

    def test_process_exit_and_diagnostics_status_must_match(self):
        with tempfile.TemporaryDirectory() as ok_temp:
            job_dir = Path(ok_temp)
            self.write_success_outputs(job_dir)

            state = bridge.ensure_backend_outputs(job_dir, 7, "job")

            self.assertEqual(7, state.returncode)
            self.assertEqual("backend_status_mismatch", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )

        with tempfile.TemporaryDirectory() as error_temp:
            job_dir = Path(error_temp)
            self.write_diagnostics(
                job_dir,
                status="error",
                errors=[{"code": "job_failed", "message": "Job failed."}],
                outputs={},
            )

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual(1, state.returncode)
            self.assertEqual("backend_status_mismatch", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )

    def test_status_output_mapping_is_exact_and_confined(self):
        invalid_mappings = {
            "wrong_filename": {
                "diagnostics": "diagnostics.json",
                "drawing_ir": "../drawing_ir.json",
                "svg": "sheet.svg",
            },
            "missing_key": {
                "diagnostics": "diagnostics.json",
                "drawing_ir": "drawing_ir.json",
            },
            "unexpected_key": {
                **self.success_output_mapping(),
                "raw": "untrusted.txt",
            },
        }
        for label, outputs in invalid_mappings.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                self.write_diagnostics(job_dir, status="ok", outputs=outputs)

                state = bridge.ensure_backend_outputs(job_dir, 0, "job")

                self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])
                self.assertEqual(
                    {"diagnostics": job_dir / "diagnostics.json"},
                    state.approved_outputs,
                )

    def test_drawing_ir_requires_strict_json_and_top_level_contract(self):
        invalid_raw_payloads = {
            "array": b"[]\n",
            "duplicate": (
                b'{"schema_version":"1.0","schema_version":"1.0","source_job_id":"job",'
                b'"sheet":{},"layers":[],"views":[]}\n'
            ),
            "nonfinite": (
                b'{"schema_version":"1.0","source_job_id":"job","sheet":{"width":NaN},'
                b'"layers":[],"views":[]}\n'
            ),
        }
        for label, raw in invalid_raw_payloads.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                self.write_success_outputs(job_dir)
                (job_dir / "drawing_ir.json").write_bytes(raw)

                state = bridge.ensure_backend_outputs(job_dir, 0, "job")

                self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])
                self.assertEqual(
                    {"diagnostics": job_dir / "diagnostics.json"},
                    state.approved_outputs,
                )

        invalid_objects = {
            "schema": self.valid_drawing_ir(schema_version="2.0"),
            "source_job_id": self.valid_drawing_ir(source_job_id=""),
            "mismatched_source_job_id": self.valid_drawing_ir(source_job_id="another-job"),
            "sheet": self.valid_drawing_ir(sheet=[]),
            "layers": self.valid_drawing_ir(layers={}),
            "views": self.valid_drawing_ir(views={}),
            "layer_item": self.valid_drawing_ir(layers=["visible"]),
            "view_item": self.valid_drawing_ir(views=["front"]),
        }
        for label, payload in invalid_objects.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                self.write_success_outputs(job_dir, drawing_ir=payload)

                state = bridge.ensure_backend_outputs(job_dir, 0, "job")

                self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])
                self.assertEqual(
                    {"diagnostics": job_dir / "diagnostics.json"},
                    state.approved_outputs,
                )

    def test_drawing_ir_source_job_id_is_bound_before_backend_execution(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            self.write_success_outputs(
                job_dir,
                drawing_ir=self.valid_drawing_ir(source_job_id="backend-mutated-job"),
            )
            bridge.write_json(
                job_dir / "job.json",
                {"job_id": "backend-mutated-job", "schema_version": "1.0"},
            )

            state = bridge.ensure_backend_outputs(job_dir, 0, "submitted-job")

            self.assertEqual(1, state.returncode)
            self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )

    def test_svg_outputs_require_utf8_xml_with_svg_root(self):
        invalid_svg = {
            "empty": b"",
            "invalid_utf8": b"\xff",
            "invalid_xml": b"<svg>",
            "wrong_root": b"<html></html>",
        }
        for label, raw in invalid_svg.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_dir:
                job_dir = Path(temp_dir)
                self.write_success_outputs(job_dir, with_overlay=True)
                (job_dir / "sheet.svg").write_bytes(raw)

                state = bridge.ensure_backend_outputs(job_dir, 0, "job")

                self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])
                self.assertEqual(
                    {"diagnostics": job_dir / "diagnostics.json"},
                    state.approved_outputs,
                )

    def test_output_files_must_be_regular_nonempty_and_not_symlinks(self):
        with tempfile.TemporaryDirectory() as empty_temp:
            job_dir = Path(empty_temp)
            self.write_success_outputs(job_dir)
            (job_dir / "drawing_ir.json").write_bytes(b"")

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])

        with tempfile.TemporaryDirectory() as directory_temp:
            job_dir = Path(directory_temp)
            self.write_success_outputs(job_dir)
            (job_dir / "drawing_ir.json").unlink()
            (job_dir / "drawing_ir.json").mkdir()

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])

    def test_symlinked_output_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            job_dir = root / "job"
            job_dir.mkdir()
            self.write_success_outputs(job_dir)
            outside = root / "outside.json"
            outside.write_text((job_dir / "drawing_ir.json").read_text(encoding="utf-8"), encoding="utf-8")
            (job_dir / "drawing_ir.json").unlink()
            try:
                (job_dir / "drawing_ir.json").symlink_to(outside)
            except OSError as exc:
                self.skipTest(f"Symlink creation is unavailable: {exc}")

            state = bridge.ensure_backend_outputs(job_dir, 0, "job")

            self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )

    def test_error_outputs_allow_only_valid_utf8_crash_log_and_approve_diagnostics(self):
        with tempfile.TemporaryDirectory() as valid_temp:
            job_dir = Path(valid_temp)
            (job_dir / "crash.log").write_text("Traceback: test\n", encoding="utf-8")
            self.write_diagnostics(
                job_dir,
                status="error",
                errors=[{"code": "backend_crash", "message": "Unexpected backend crash."}],
                outputs={"crash_log": "crash.log"},
            )

            state = bridge.ensure_backend_outputs(job_dir, 1, "job")

            self.assertEqual(1, state.returncode)
            self.assertEqual("backend_crash", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {
                    "crash_log": job_dir / "crash.log",
                    "diagnostics": job_dir / "diagnostics.json",
                },
                state.approved_outputs,
            )

        with tempfile.TemporaryDirectory() as invalid_temp:
            job_dir = Path(invalid_temp)
            (job_dir / "crash.log").write_bytes(b"\xff")
            self.write_diagnostics(
                job_dir,
                status="error",
                errors=[{"code": "backend_crash", "message": "Unexpected backend crash."}],
                outputs={"crash_log": "crash.log"},
            )

            state = bridge.ensure_backend_outputs(job_dir, 1, "job")

            self.assertEqual("backend_invalid_outputs", state.diagnostics["errors"][0]["code"])
            self.assertEqual(
                {"diagnostics": job_dir / "diagnostics.json"},
                state.approved_outputs,
            )

    @staticmethod
    def make_backend_source(source_dir, main_source=""):
        package_dir = source_dir / "blueprints_backend"
        package_dir.mkdir(parents=True)
        (package_dir / "__init__.py").write_text("", encoding="utf-8")
        (package_dir / "__main__.py").write_text(main_source, encoding="utf-8")
        return source_dir

    @staticmethod
    def success_output_mapping(with_overlay=False):
        outputs = {
            "diagnostics": "diagnostics.json",
            "drawing_ir": "drawing_ir.json",
            "svg": "sheet.svg",
        }
        if with_overlay:
            outputs["image_assist_overlay"] = "assist_overlay.svg"
        return outputs

    @staticmethod
    def valid_drawing_ir(**overrides):
        payload = {
            "layers": [],
            "schema_version": "1.0",
            "sheet": {},
            "source_job_id": "job",
            "views": [{}],
        }
        payload.update(overrides)
        return payload

    def write_success_outputs(self, job_dir, *, warnings=None, with_overlay=False, drawing_ir=None):
        bridge.write_json(
            job_dir / "job.json",
            {"job_id": "job", "schema_version": "1.0"},
        )
        bridge.write_json(
            job_dir / "drawing_ir.json",
            self.valid_drawing_ir() if drawing_ir is None else drawing_ir,
        )
        (job_dir / "sheet.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
            encoding="utf-8",
        )
        if with_overlay:
            (job_dir / "assist_overlay.svg").write_text("<svg></svg>\n", encoding="utf-8")
        self.write_diagnostics(
            job_dir,
            status="ok",
            outputs=self.success_output_mapping(with_overlay=with_overlay),
            warnings=warnings,
        )

    @staticmethod
    def write_diagnostics(job_dir, *, status, outputs, errors=None, warnings=None):
        bridge.write_json(
            job_dir / "diagnostics.json",
            {
                "errors": errors or [],
                "outputs": outputs,
                "schema_version": "1.0",
                "status": status,
                "warnings": warnings or [],
            },
        )


if __name__ == "__main__":
    unittest.main()
