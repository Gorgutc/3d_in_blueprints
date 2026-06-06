import json


def ok(warnings=None, standards=None):
    payload = {
        "errors": [],
        "outputs": {
            "diagnostics": "diagnostics.json",
            "drawing_ir": "drawing_ir.json",
            "svg": "sheet.svg",
        },
        "schema_version": "1.0",
        "status": "ok",
        "warnings": warnings or [],
    }
    if standards is not None:
        payload["standards"] = standards
    return payload


def error(code, message):
    return {
        "errors": [
            {
                "code": code,
                "message": message,
            }
        ],
        "outputs": {},
        "schema_version": "1.0",
        "status": "error",
        "warnings": [],
    }


def write(path, payload):
    path.write_text(json.dumps(payload, allow_nan=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
