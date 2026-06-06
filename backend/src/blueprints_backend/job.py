import json
import math
from pathlib import PurePath


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

    validate_job(payload, path.parent)
    return payload


def validate_job(payload, job_dir=None):
    require(isinstance(payload, dict), "invalid_job", "job.json must be a JSON object.")
    require(payload.get("schema_version") == "1.0", "invalid_schema", "job.json schema_version must be 1.0.")
    require(isinstance(payload.get("job_id"), str) and payload["job_id"], "invalid_job", "job_id is required.")

    sheet = payload.get("sheet")
    require(isinstance(sheet, dict), "invalid_sheet", "sheet is required.")
    require(is_number(sheet.get("width_mm")) and sheet["width_mm"] > 0, "invalid_sheet", "sheet.width_mm must be positive.")
    require(is_number(sheet.get("height_mm")) and sheet["height_mm"] > 0, "invalid_sheet", "sheet.height_mm must be positive.")
    require(isinstance(sheet.get("format"), str) and sheet["format"], "invalid_sheet", "sheet.format is required.")
    validate_sheet_standard(sheet)

    if "views" in payload:
        views = payload.get("views")
        require(isinstance(views, list) and views, "invalid_views", "views must contain at least one view.")
        for view in views:
            validate_view(view)
        return

    validate_scene_source(payload.get("source"), job_dir)


def validate_scene_source(source, job_dir):
    require(isinstance(source, dict), "invalid_source", "source is required when views are omitted.")
    scene_snapshot = source.get("scene_snapshot")
    require(is_repo_relative_path(scene_snapshot), "invalid_source", "source.scene_snapshot must be a relative file path.")

    assets = source.get("assets")
    require(isinstance(assets, dict), "invalid_source", "source.assets is required.")
    scene_asset = assets.get("scene")
    require(is_repo_relative_path(scene_asset), "invalid_source", "source.assets.scene must be a relative file path.")

    if job_dir is not None:
        require((job_dir / scene_snapshot).exists(), "missing_source", f"{scene_snapshot} was not found in the job folder.")
        require((job_dir / scene_asset).exists(), "missing_source", f"{scene_asset} was not found in the job folder.")


def validate_sheet_standard(sheet):
    standard = sheet.get("standard")
    if standard is None:
        return

    require(standard == "GOST", "invalid_sheet", "sheet.standard must be GOST when provided.")
    require(sheet["format"] == "A4", "invalid_sheet", "GOST v1 supports A4 sheets only.")
    require(
        sheet["width_mm"] == 210 and sheet["height_mm"] == 297,
        "invalid_sheet",
        "GOST v1 supports A4 portrait sheets of 210x297 mm only.",
    )
    title_block = sheet.get("title_block", {})
    require(isinstance(title_block, dict), "invalid_sheet", "sheet.title_block must be an object when provided.")
    for field in ("designation", "scale", "sheet", "sheets", "title"):
        if field in title_block:
            require(isinstance(title_block[field], str) and title_block[field], "invalid_sheet", f"sheet.title_block.{field} must be a non-empty string.")


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


def is_repo_relative_path(value):
    if not isinstance(value, str) or not value:
        return False
    path = PurePath(value)
    return not path.is_absolute() and ".." not in path.parts


def reject_json_constant(value):
    raise ValueError(f"job.json contains non-finite number {value}.")
