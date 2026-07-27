import json
from pathlib import Path, PurePosixPath, PureWindowsPath

from . import dimensions, image_assist
from .drawing_ir import LAYER_STYLES, default_style
from .validation import (
    JobError,
    is_number,
    require_stroked_line_layer,
    require_xml_1_0_text,
)


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
    validate_xml_text(payload)
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
        validate_unique_view_ids(views)
        validate_standards(payload.get("standards"))
        validate_image_assist(payload.get("image_assist"))
        return

    validate_scene_source(payload.get("source"), job_dir)
    validate_image_assist(payload.get("image_assist"))


def validate_scene_source(source, job_dir):
    require(isinstance(source, dict), "invalid_source", "source is required when views are omitted.")
    scene_snapshot = source.get("scene_snapshot")
    require(is_repo_relative_path(scene_snapshot), "invalid_source", "source.scene_snapshot must be a relative file path.")

    assets = source.get("assets")
    require(isinstance(assets, dict), "invalid_source", "source.assets is required.")
    scene_asset = assets.get("scene")
    require(is_repo_relative_path(scene_asset), "invalid_source", "source.assets.scene must be a relative file path.")

    if job_dir is not None:
        snapshot_path = validate_source_file(
            job_dir,
            scene_snapshot,
            "source.scene_snapshot",
        )
        validate_source_file(
            job_dir,
            scene_asset,
            "source.assets.scene",
        )
        validate_scene_snapshot(snapshot_path)


def validate_source_file(job_dir, relative_path, field_name):
    job_root = Path(job_dir)
    relative_parts = PurePosixPath(relative_path).parts
    target = job_root.joinpath(*relative_parts)

    current = job_root
    for part in relative_parts:
        current = current / part
        require(
            not current.is_symlink(),
            "invalid_source",
            f"{field_name} must not resolve through a symlink.",
        )

    try:
        resolved_root = job_root.resolve(strict=True)
        resolved_target = target.resolve(strict=False)
    except OSError as exc:
        raise JobError(
            "invalid_source",
            f"{field_name} could not be resolved inside the job folder.",
        ) from exc

    require(
        resolved_target != resolved_root and resolved_target.is_relative_to(resolved_root),
        "invalid_source",
        f"{field_name} must resolve inside the job folder.",
    )
    require(
        target.exists(),
        "missing_source",
        f"{relative_path} was not found in the job folder.",
    )
    require(
        target.is_file(),
        "invalid_source",
        f"{field_name} must reference a regular file.",
    )
    try:
        file_size = target.stat().st_size
    except OSError as exc:
        raise JobError(
            "invalid_source",
            f"{field_name} could not be inspected.",
        ) from exc
    require(
        file_size > 0,
        "invalid_source",
        f"{field_name} must reference a non-empty file.",
    )
    return target


def validate_scene_snapshot(snapshot_path):
    try:
        snapshot_text = snapshot_path.read_text(encoding="utf-8")
        snapshot = json.loads(
            snapshot_text,
            parse_constant=reject_scene_snapshot_json_constant,
        )
    except (OSError, UnicodeError, ValueError) as exc:
        raise JobError(
            "invalid_source",
            "source.scene_snapshot must be strict UTF-8 JSON.",
        ) from exc

    require(
        isinstance(snapshot, dict),
        "invalid_source",
        "source.scene_snapshot must contain a JSON object.",
    )
    require(
        snapshot.get("schema_version") == "1.0",
        "invalid_source",
        "source.scene_snapshot schema_version must be 1.0.",
    )


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


def validate_unique_view_ids(views):
    require_unique_ids(
        views,
        "invalid_view",
        "view.id values must be unique.",
    )


def validate_view(view):
    require(isinstance(view, dict), "invalid_view", "Each view must be an object.")
    require(isinstance(view.get("id"), str) and view["id"], "invalid_view", "view.id is required.")
    require(is_pair(view.get("origin_mm")), "invalid_view", "view.origin_mm must be a two-number array.")
    require(is_number(view.get("scale")) and view["scale"] > 0, "invalid_view", "view.scale must be positive.")
    entities = view.get("entities")
    require(isinstance(entities, list), "invalid_entities", "view.entities must be an array.")
    for entity in entities:
        validate_entity(entity)
    validate_unique_entity_ids(entities)
    dimensions = view.get("dimensions", [])
    require(isinstance(dimensions, list), "invalid_dimensions", "view.dimensions must be an array when provided.")
    for dimension in dimensions:
        validate_dimension(dimension)
    validate_unique_dimension_ids(dimensions)


def validate_entity(entity):
    require(isinstance(entity, dict), "invalid_entity", "Each entity must be an object.")
    require(isinstance(entity.get("id"), str) and entity["id"], "invalid_entity", "entity.id is required.")
    require(isinstance(entity.get("type"), str) and entity["type"], "invalid_entity", "entity.type is required.")
    if entity["type"] != "line":
        return
    require(is_pair(entity.get("start_mm")), "invalid_entity", "line.start_mm must be a two-number array.")
    require(is_pair(entity.get("end_mm")), "invalid_entity", "line.end_mm must be a two-number array.")
    require(isinstance(entity.get("layer"), str) and entity["layer"], "invalid_entity", "entity.layer is required.")
    layer_style = LAYER_STYLES.get(entity["layer"], default_style())
    require_stroked_line_layer(layer_style)


def validate_dimension(dimension):
    require(isinstance(dimension, dict), "invalid_dimension", "Each dimension must be an object.")
    require(isinstance(dimension.get("id"), str) and dimension["id"], "invalid_dimension", "dimension.id is required.")
    require(isinstance(dimension.get("type"), str) and dimension["type"], "invalid_dimension", "dimension.type is required.")
    if dimension["type"] not in dimensions.SUPPORTED_DIMENSION_TYPES:
        return

    if dimension["type"] == "linear":
        require(is_pair(dimension.get("start_mm")), "invalid_dimension", "linear.start_mm must be a two-number array.")
        require(is_pair(dimension.get("end_mm")), "invalid_dimension", "linear.end_mm must be a two-number array.")
        validate_optional_offset(dimension)
    elif dimension["type"] == "diameter":
        require(is_pair(dimension.get("center_mm")), "invalid_dimension", "diameter.center_mm must be a two-number array.")
        require(is_number(dimension.get("diameter_mm")) and dimension["diameter_mm"] > 0, "invalid_dimension", "diameter.diameter_mm must be positive.")
    elif dimension["type"] == "radius":
        require(is_pair(dimension.get("center_mm")), "invalid_dimension", "radius.center_mm must be a two-number array.")
        require(is_pair(dimension.get("point_mm")), "invalid_dimension", "radius.point_mm must be a two-number array.")
    elif dimension["type"] == "hole":
        require(is_pair(dimension.get("center_mm")), "invalid_dimension", "hole.center_mm must be a two-number array.")
        require(is_number(dimension.get("diameter_mm")) and dimension["diameter_mm"] > 0, "invalid_dimension", "hole.diameter_mm must be positive.")
    elif dimension["type"] == "center_distance":
        centers = dimension.get("centers_mm")
        require(isinstance(centers, list) and len(centers) == 2 and all(is_pair(center) for center in centers), "invalid_dimension", "center_distance.centers_mm must contain two point arrays.")
        validate_optional_offset(dimension)

    if "label" in dimension:
        require(isinstance(dimension["label"], str) and dimension["label"], "invalid_dimension", "dimension.label must be a non-empty string when provided.")


def validate_standards(standards_payload):
    if standards_payload is None:
        return

    require(isinstance(standards_payload, dict), "invalid_standards", "standards must be an object when provided.")
    fastener_matches = standards_payload.get("fastener_matches", [])
    require(isinstance(fastener_matches, list), "invalid_standards", "standards.fastener_matches must be an array when provided.")
    for request in fastener_matches:
        validate_fastener_match(request)
    validate_unique_standard_match_ids(fastener_matches)


def validate_image_assist(image_assist_payload):
    if image_assist_payload is None:
        return

    require(isinstance(image_assist_payload, dict), "invalid_image_assist", "image_assist must be an object when provided.")
    require(image_assist_payload.get("mode") == "assistive", "invalid_image_assist", "image_assist.mode must be assistive in I6.")

    scale = image_assist_payload.get("scale", {"kind": "relative"})
    require(isinstance(scale, dict), "invalid_image_assist", "image_assist.scale must be an object when provided.")
    if "kind" in scale:
        require(scale["kind"] == "relative", "invalid_image_assist", "image_assist.scale.kind must be relative in I6.")
    if "reference_mm_per_unit" in scale:
        require(
            is_number(scale["reference_mm_per_unit"]) and scale["reference_mm_per_unit"] > 0,
            "invalid_image_assist",
            "image_assist.scale.reference_mm_per_unit must be positive when provided.",
        )

    overlays = image_assist_payload.get("overlays")
    require(isinstance(overlays, list), "invalid_image_assist", "image_assist.overlays must be an array.")
    for overlay in overlays:
        validate_image_assist_overlay(overlay, scale)
    validate_unique_image_assist_overlay_ids(overlays)


def validate_image_assist_overlay(overlay, scale):
    require(isinstance(overlay, dict), "invalid_image_assist", "Each image_assist overlay must be an object.")
    require(isinstance(overlay.get("id"), str) and overlay["id"], "invalid_image_assist", "image_assist overlay id is required.")
    require(isinstance(overlay.get("type"), str) and overlay["type"], "invalid_image_assist", "image_assist overlay type is required.")

    if overlay["type"] not in image_assist.SUPPORTED_OVERLAY_TYPES:
        return

    if overlay["type"] == "contour":
        if contains_absolute_coordinates(overlay) and not has_absolute_scale(scale):
            raise JobError("invalid_image_assist", "image_assist overlay absolute coordinates require scale.reference_mm_per_unit.")
        points = overlay.get("points_rel")
        require(
            isinstance(points, list) and len(points) >= 2 and all(is_pair(point) for point in points),
            "invalid_image_assist",
            "contour.points_rel must contain at least two relative point arrays.",
        )
    elif overlay["type"] == "primitive_hint":
        require(isinstance(overlay.get("primitive"), str) and overlay["primitive"], "invalid_image_assist", "primitive_hint.primitive is required.")
        if overlay["primitive"] not in image_assist.SUPPORTED_PRIMITIVES:
            return
        if contains_absolute_coordinates(overlay) and not has_absolute_scale(scale):
            raise JobError("invalid_image_assist", "image_assist overlay absolute coordinates require scale.reference_mm_per_unit.")
        if overlay["primitive"] == "circle":
            require(is_pair(overlay.get("center_rel")), "invalid_image_assist", "primitive_hint.center_rel must be a two-number array.")
            require(
                is_number(overlay.get("radius_rel")) and overlay["radius_rel"] > 0,
                "invalid_image_assist",
                "primitive_hint.radius_rel must be positive.",
            )
    elif overlay["type"] == "relative_dimension":
        if contains_absolute_coordinates(overlay) and not has_absolute_scale(scale):
            raise JobError("invalid_image_assist", "image_assist overlay absolute coordinates require scale.reference_mm_per_unit.")
        require(is_pair(overlay.get("start_rel")), "invalid_image_assist", "relative_dimension.start_rel must be a two-number array.")
        require(is_pair(overlay.get("end_rel")), "invalid_image_assist", "relative_dimension.end_rel must be a two-number array.")
        if "label" in overlay:
            require(isinstance(overlay["label"], str) and overlay["label"], "invalid_image_assist", "relative_dimension.label must be a non-empty string when provided.")


def validate_unique_image_assist_overlay_ids(overlays):
    require_unique_ids(
        overlays,
        "invalid_image_assist",
        "image_assist overlay id values must be unique.",
    )


def contains_absolute_coordinates(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith("_mm"):
                return True
            if key == "units" and item == "mm":
                return True
            if contains_absolute_coordinates(item):
                return True
    elif isinstance(value, list):
        return any(contains_absolute_coordinates(item) for item in value)
    return False


def has_absolute_scale(scale):
    return is_number(scale.get("reference_mm_per_unit")) and scale["reference_mm_per_unit"] > 0


def validate_fastener_match(request):
    require(isinstance(request, dict), "invalid_standards", "Each standards.fastener_matches item must be an object.")
    require(isinstance(request.get("id"), str) and request["id"], "invalid_standards", "standards.fastener_matches.id is required.")
    require(isinstance(request.get("view_id"), str) and request["view_id"], "invalid_standards", "standards.fastener_matches.view_id is required.")
    require(isinstance(request.get("dimension_id"), str) and request["dimension_id"], "invalid_standards", "standards.fastener_matches.dimension_id is required.")
    require(isinstance(request.get("family"), str) and request["family"], "invalid_standards", "standards.fastener_matches.family is required.")
    require(
        is_number(request.get("nominal_diameter_mm")) and request["nominal_diameter_mm"] > 0,
        "invalid_standards",
        "standards.fastener_matches.nominal_diameter_mm must be positive.",
    )


def validate_unique_dimension_ids(dimensions):
    require_unique_ids(
        dimensions,
        "invalid_dimension",
        "dimension.id values must be unique within a view.",
    )


def validate_unique_entity_ids(entities):
    require_unique_ids(
        entities,
        "invalid_entity",
        "entity.id values must be unique within a view.",
    )


def validate_unique_standard_match_ids(fastener_matches):
    require_unique_ids(
        fastener_matches,
        "invalid_standards",
        "standards.fastener_matches.id values must be unique.",
    )


def require_unique_ids(items, code, message):
    logical_ids = [item["id"] for item in items]
    require(len(logical_ids) == len(set(logical_ids)), code, message)


def validate_optional_offset(dimension):
    if "offset_mm" in dimension:
        require(is_pair(dimension["offset_mm"]), "invalid_dimension", "dimension.offset_mm must be a two-number array when provided.")


def require(condition, code, message):
    if not condition:
        raise JobError(code, message)


def is_pair(value):
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(is_number(item) for item in value)
    )


def is_repo_relative_path(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        return False
    parts = value.split("/")
    if any(
        not part
        or part in {".", ".."}
        or part != part.strip()
        for part in parts
    ):
        return False
    posix_path = PurePosixPath(value)
    windows_path = PureWindowsPath(value)
    return (
        value == posix_path.as_posix()
        and not posix_path.is_absolute()
        and not windows_path.is_absolute()
        and not windows_path.drive
        and not windows_path.root
    )


def validate_xml_text(value):
    if isinstance(value, str):
        require_xml_1_0_text(value, "job.json")
        return
    if isinstance(value, list):
        for item in value:
            validate_xml_text(item)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(key, str):
                require_xml_1_0_text(key, "job.json")
            validate_xml_text(item)


def reject_json_constant(value):
    raise ValueError(f"job.json contains non-finite number {value}.")


def reject_scene_snapshot_json_constant(value):
    raise ValueError(f"SceneSnapshot contains non-finite number {value}.")
