import json
import sys
import traceback
from pathlib import Path

from . import diagnostics
from . import drawing_ir
from . import image_assist
from . import svg_writer
from .job import JobError, load_job


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("Usage: python -m blueprints_backend <job-folder>", file=sys.stderr)
        return 2

    job_dir = Path(args[0])
    diagnostics_path = job_dir / "diagnostics.json"

    try:
        job = load_job(job_dir / "job.json")
        ir, warnings = drawing_ir.build(job)
        write_json(job_dir / "drawing_ir.json", ir)
        (job_dir / "sheet.svg").write_text(svg_writer.render(ir), encoding="utf-8")
        if ir.get("image_assist"):
            (job_dir / "assist_overlay.svg").write_text(image_assist.render_overlay(ir), encoding="utf-8")
        diagnostics.write(
            diagnostics_path,
            diagnostics.ok(
                warnings,
                ir.get("standards") if job.get("standards") else None,
                image_assist=bool(ir.get("image_assist")),
            ),
        )
        return 0
    except JobError as exc:
        return write_error(diagnostics_path, exc.code, exc.message)
    except OSError as exc:
        return write_error(diagnostics_path, "filesystem_error", str(exc))
    except Exception:
        return write_crash_error(job_dir, diagnostics_path)


def write_json(path, payload):
    path.write_text(json.dumps(payload, allow_nan=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_error(path, code, message):
    try:
        diagnostics.write(path, diagnostics.error(code, message))
    except OSError as exc:
        print(f"Failed to write diagnostics: {exc}", file=sys.stderr)
    return 1


def write_crash_error(job_dir, diagnostics_path):
    try:
        (job_dir / "crash.log").write_text(traceback.format_exc(), encoding="utf-8")
        diagnostics.write(
            diagnostics_path,
            diagnostics.error(
                "backend_crash",
                "Unexpected backend crash. See crash.log for traceback.",
                outputs={"crash_log": "crash.log"},
            ),
        )
    except OSError as exc:
        print(f"Failed to write crash diagnostics: {exc}", file=sys.stderr)
    return 1
