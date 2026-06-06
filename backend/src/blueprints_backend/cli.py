import json
import sys
from pathlib import Path

from . import diagnostics
from . import drawing_ir
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
        diagnostics.write(diagnostics_path, diagnostics.ok(warnings))
        return 0
    except JobError as exc:
        return write_error(diagnostics_path, exc.code, exc.message)
    except OSError as exc:
        return write_error(diagnostics_path, "filesystem_error", str(exc))


def write_json(path, payload):
    path.write_text(json.dumps(payload, allow_nan=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_error(path, code, message):
    try:
        diagnostics.write(path, diagnostics.error(code, message))
    except OSError as exc:
        print(f"Failed to write diagnostics: {exc}", file=sys.stderr)
    return 1
