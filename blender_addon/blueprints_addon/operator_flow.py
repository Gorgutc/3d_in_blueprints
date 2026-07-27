from dataclasses import dataclass


@dataclass(frozen=True)
class OperatorOutcome:
    status: str
    report_level: str
    report_message: str


def run_operator_flow(
    *,
    clear_preview,
    get_preferences,
    resolve_backend,
    run_bridge,
    load_preview,
    bridge_error_type,
):
    try:
        clear_preview()
        preferences = get_preferences()
        backend_source = resolve_backend(preferences)
        result = run_bridge(preferences, backend_source)
        outcome = classify_bridge_result(result)
        load_preview(preview_outputs_for_outcome(result, outcome))
        return outcome
    except bridge_error_type as exc:
        return OperatorOutcome(
            status="CANCELLED",
            report_level="ERROR",
            report_message=str(exc),
        )
    except Exception as exc:
        return OperatorOutcome(
            status="CANCELLED",
            report_level="ERROR",
            report_message=f"Blueprint generation failed: {exc}",
        )


def classify_bridge_result(result):
    diagnostics = result.diagnostics
    if result.returncode != 0 or diagnostics.get("status") != "ok":
        return OperatorOutcome(
            status="CANCELLED",
            report_level="ERROR",
            report_message=first_diagnostic_message(
                diagnostics.get("errors"),
                fallback=f"Backend failed; diagnostics loaded from {result.job_dir}",
            ),
        )

    warnings = diagnostics.get("warnings") or []
    if warnings:
        return OperatorOutcome(
            status="FINISHED",
            report_level="WARNING",
            report_message=warning_report_message(warnings, result.job_dir),
        )

    return OperatorOutcome(
        status="FINISHED",
        report_level="INFO",
        report_message=f"Blueprint generated in {result.job_dir}",
    )


def first_diagnostic_message(items, *, fallback):
    messages = formatted_diagnostic_messages(items)
    if messages:
        return messages[0]
    return fallback


def formatted_diagnostic_messages(items):
    messages = []
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            code = item.get("code")
            message = item.get("message")
            if isinstance(code, str) and code and isinstance(message, str) and message:
                messages.append(f"[{code}] {message}")
    return messages


def preview_outputs_for_outcome(result, outcome):
    if outcome.status != "CANCELLED":
        return result.approved_outputs
    diagnostics_path = result.approved_outputs.get("diagnostics")
    if diagnostics_path is None:
        return {}
    return {"diagnostics": diagnostics_path}


def warning_report_message(warnings, job_dir):
    messages = formatted_diagnostic_messages(warnings)
    if messages:
        return "; ".join(messages)
    return f"Backend completed with warnings; diagnostics loaded from {job_dir}"
