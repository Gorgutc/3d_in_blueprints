import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[2]
OPERATOR_FLOW_PATH = (
    ROOT / "blender_addon" / "blueprints_addon" / "operator_flow.py"
)


def load_operator_flow():
    spec = importlib.util.spec_from_file_location(
        "blueprints_operator_flow_under_test",
        OPERATOR_FLOW_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


operator_flow = load_operator_flow()


class FakeBridgeError(RuntimeError):
    pass


class FakeBridgeConfigurationError(FakeBridgeError):
    pass


class OperatorFlowTests(unittest.TestCase):
    def test_warning_free_success_reports_info_and_finishes(self):
        result = bridge_result(status="ok")

        outcome = operator_flow.classify_bridge_result(result)

        self.assertEqual("FINISHED", outcome.status)
        self.assertEqual("INFO", outcome.report_level)
        self.assertEqual(
            f"Blueprint generated in {result.job_dir}",
            outcome.report_message,
        )

    def test_projection_pending_reports_warning_without_false_success(self):
        result = bridge_result(
            status="ok",
            warnings=[
                {
                    "code": "projection_pending",
                    "message": "Projection is pending.",
                }
            ],
        )

        outcome = operator_flow.classify_bridge_result(result)

        self.assertEqual("FINISHED", outcome.status)
        self.assertEqual("WARNING", outcome.report_level)
        self.assertIn("[projection_pending] Projection is pending.", outcome.report_message)
        self.assertNotIn("Blueprint generated", outcome.report_message)

    def test_other_backend_warning_is_not_reported_as_info(self):
        result = bridge_result(
            status="ok",
            warnings=[
                {
                    "code": "unsupported_entity",
                    "message": "One entity was skipped.",
                },
                {
                    "code": "unsupported_dimension",
                    "message": "One dimension was skipped.",
                },
            ],
        )

        outcome = operator_flow.classify_bridge_result(result)

        self.assertEqual("FINISHED", outcome.status)
        self.assertEqual("WARNING", outcome.report_level)
        self.assertIn("[unsupported_entity]", outcome.report_message)
        self.assertIn("One entity was skipped.", outcome.report_message)
        self.assertIn("[unsupported_dimension]", outcome.report_message)
        self.assertIn("One dimension was skipped.", outcome.report_message)
        self.assertNotIn("Blueprint generated", outcome.report_message)

    def test_error_status_or_nonzero_returncode_surfaces_first_diagnostic_and_cancels(self):
        cases = (
            bridge_result(status="error", returncode=0),
            bridge_result(status="ok", returncode=7),
        )

        for result in cases:
            with self.subTest(status=result.diagnostics["status"], returncode=result.returncode):
                outcome = operator_flow.classify_bridge_result(result)

                self.assertEqual("CANCELLED", outcome.status)
                self.assertEqual("ERROR", outcome.report_level)
                self.assertEqual(
                    "[backend_failed] Backend failed.",
                    outcome.report_message,
                )

    def test_failure_without_valid_error_uses_generic_fallback(self):
        result = bridge_result(status="error", returncode=1)
        result.diagnostics["errors"] = []

        outcome = operator_flow.classify_bridge_result(result)

        self.assertEqual("CANCELLED", outcome.status)
        self.assertEqual("ERROR", outcome.report_level)
        self.assertEqual(
            f"Backend failed; diagnostics loaded from {result.job_dir}",
            outcome.report_message,
        )

    def test_flow_resolves_backend_before_bridge_and_loads_approved_outputs(self):
        events = []
        preferences = object()
        backend_source = Path("backend/src")
        result = bridge_result(status="ok")

        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: events.append("clear"),
            get_preferences=lambda: record_and_return(events, "preferences", preferences),
            resolve_backend=lambda value: record_and_return(
                events,
                ("resolve", value),
                backend_source,
            ),
            run_bridge=lambda value, source: record_and_return(
                events,
                ("bridge", value, source),
                result,
            ),
            load_preview=lambda outputs: events.append(("load", outputs)),
            bridge_error_type=FakeBridgeError,
        )

        self.assertEqual("FINISHED", outcome.status)
        self.assertEqual(
            [
                "clear",
                "preferences",
                ("resolve", preferences),
                ("bridge", preferences, backend_source),
                ("load", result.approved_outputs),
            ],
            events,
        )

    def test_failure_result_loads_only_approved_diagnostics(self):
        result = bridge_result(status="error", returncode=1)
        loaded = []

        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: None,
            get_preferences=lambda: object(),
            resolve_backend=lambda _preferences: Path("backend/src"),
            run_bridge=lambda _preferences, _backend_source: result,
            load_preview=loaded.append,
            bridge_error_type=FakeBridgeError,
        )

        self.assertEqual("CANCELLED", outcome.status)
        self.assertEqual(
            [{"diagnostics": result.approved_outputs["diagnostics"]}],
            loaded,
        )

    def test_backend_not_configured_cancels_after_invalidating_preview(self):
        events = []
        message = (
            "Backend Source is not configured. Extract the backend ZIP and select "
            "the folder containing blueprints_backend in Add-on Preferences."
        )

        def fail_resolution(_preferences):
            events.append("resolve")
            raise FakeBridgeConfigurationError(message)

        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: events.append("clear"),
            get_preferences=lambda: record_and_return(events, "preferences", object()),
            resolve_backend=fail_resolution,
            run_bridge=lambda _preferences, _backend_source: events.append("bridge"),
            load_preview=lambda _outputs: events.append("load"),
            bridge_error_type=FakeBridgeError,
        )

        self.assertEqual(["clear", "preferences", "resolve"], events)
        self.assertEqual("CANCELLED", outcome.status)
        self.assertEqual("ERROR", outcome.report_level)
        self.assertEqual(message, outcome.report_message)

    def test_unexpected_preference_error_is_controlled(self):
        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: None,
            get_preferences=lambda: raise_unexpected("preferences unavailable"),
            resolve_backend=lambda _preferences: Path("backend/src"),
            run_bridge=lambda _preferences, _backend_source: None,
            load_preview=lambda _outputs: None,
            bridge_error_type=FakeBridgeError,
        )

        self.assert_unexpected_failure(outcome, "preferences unavailable")

    def test_unexpected_clear_error_is_controlled(self):
        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: raise_unexpected("text block clear failed"),
            get_preferences=lambda: object(),
            resolve_backend=lambda _preferences: Path("backend/src"),
            run_bridge=lambda _preferences, _backend_source: None,
            load_preview=lambda _outputs: None,
            bridge_error_type=FakeBridgeError,
        )

        self.assert_unexpected_failure(outcome, "text block clear failed")

    def test_unexpected_backend_resolution_error_is_controlled(self):
        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: None,
            get_preferences=lambda: object(),
            resolve_backend=lambda _preferences: raise_unexpected(
                "backend resolution exploded"
            ),
            run_bridge=lambda _preferences, _backend_source: None,
            load_preview=lambda _outputs: None,
            bridge_error_type=FakeBridgeError,
        )

        self.assert_unexpected_failure(outcome, "backend resolution exploded")

    def test_unexpected_bridge_error_is_controlled(self):
        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: None,
            get_preferences=lambda: object(),
            resolve_backend=lambda _preferences: Path("backend/src"),
            run_bridge=lambda _preferences, _backend_source: raise_unexpected(
                "asset export exploded"
            ),
            load_preview=lambda _outputs: None,
            bridge_error_type=FakeBridgeError,
        )

        self.assert_unexpected_failure(outcome, "asset export exploded")

    def test_unexpected_preview_error_is_controlled(self):
        result = bridge_result(status="ok")
        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: None,
            get_preferences=lambda: object(),
            resolve_backend=lambda _preferences: Path("backend/src"),
            run_bridge=lambda _preferences, _backend_source: result,
            load_preview=lambda _outputs: raise_unexpected("text block write failed"),
            bridge_error_type=FakeBridgeError,
        )

        self.assert_unexpected_failure(outcome, "text block write failed")

    def assert_unexpected_failure(self, outcome, message):
        self.assertEqual("CANCELLED", outcome.status)
        self.assertEqual("ERROR", outcome.report_level)
        self.assertEqual(
            f"Blueprint generation failed: {message}",
            outcome.report_message,
        )


def bridge_result(*, status, returncode=0, warnings=None, approved_outputs=None):
    return SimpleNamespace(
        approved_outputs=approved_outputs
        or {
            "diagnostics": Path("job/diagnostics.json"),
            "drawing_ir": Path("job/drawing_ir.json"),
            "svg": Path("job/sheet.svg"),
        },
        diagnostics={
            "errors": (
                []
                if status == "ok" and returncode == 0
                else [
                    {
                        "code": "backend_failed",
                        "message": "Backend failed.",
                    }
                ]
            ),
            "status": status,
            "warnings": warnings or [],
        },
        job_dir=Path("job"),
        returncode=returncode,
    )


def record_and_return(events, event, value):
    events.append(event)
    return value


def raise_unexpected(message):
    raise RuntimeError(message)


if __name__ == "__main__":
    unittest.main()
