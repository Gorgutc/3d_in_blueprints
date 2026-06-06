import json
import math


class JobError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def load_job(path):
    if not path.exists():
        raise JobError("missing_job", "job.json was not found in the job folder.")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_json_constant)
    except json.JSONDecodeError as exc:
        raise JobError("invalid_json", f"job.json is not valid JSON: {exc.msg}.") from exc
    except ValueError as exc:
        raise JobError("invalid_json", str(exc)) from exc

    validate_job(payload)
    return payload


def validate_job(payload):
    require(isinstance(payload, dict), "invalid_job", "job.json must be a JSON object.")
    require(payload.get("schema_version") == "1.0", "invalid_schema", "job.json schema_version must be 1.0.")
    require(isinstance(payload.get("job_id"), str) and payload["job_id"], "invalid_job", "job_id is required.")

    sheet = payload.get("sheet")
    require(isinstance(sheet, dict), "invalid_sheet", "sheet is required.")
    require(is_number(sheet.get("width_mm")) and sheet["width_mm"] > 0, "invalid_sheet", "sheet.width_mm must be positive.")
    require(is_number(sheet.get("height_mm")) and sheet["height_mm"] > 0, "invalid_sheet", "sheet.height_mm must be positive.")
    require(isinstance(sheet.get("format"), str) and sheet["format"], "invalid_sheet", "sheet.format is required.")

    views = payload.get("views")
    require(isinstance(views, list) and views, "invalid_views", "views must contain at least one view.")
    for view in views:
        validate_view(view)


def validate_view(view):
    require(isinstance(view, dict), "invalid_view", "Each view must be an object.")
    require(isinstance(view.get("id"), str) and view["id"], "invalid_view", "view.id is required.")
    require(is_pair(view.get("origin_mm")), "invalid_view", "view.origin_mm must be a two-number array.")
    require(is_number(view.get("scale")) and view["scale"] > 0, "invalid_view", "view.scale must be positive.")
    entities = view.get("entities")
    require(isinstance(entities, list), "invalid_entities", "view.entities must be an array.")
    for entity in entities:
        validate_entity(entity)


def validate_entity(entity):
    require(isinstance(entity, dict), "invalid_entity", "Each entity must be an object.")
    require(isinstance(entity.get("id"), str) and entity["id"], "invalid_entity", "entity.id is required.")
    require(isinstance(entity.get("type"), str) and entity["type"], "invalid_entity", "entity.type is required.")
    if entity["type"] != "line":
        return
    require(is_pair(entity.get("start_mm")), "invalid_entity", "line.start_mm must be a two-number array.")
    require(is_pair(entity.get("end_mm")), "invalid_entity", "line.end_mm must be a two-number array.")
    require(isinstance(entity.get("layer"), str) and entity["layer"], "invalid_entity", "entity.layer is required.")


def require(condition, code, message):
    if not condition:
        raise JobError(code, message)


def is_pair(value):
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(is_number(item) for item in value)
    )


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def reject_json_constant(value):
    raise ValueError(f"job.json contains non-finite number {value}.")
