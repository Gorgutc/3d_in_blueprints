import math


SUPPORTED_DIMENSION_TYPES = {
    "center_distance",
    "diameter",
    "hole",
    "linear",
    "radius",
}


def compose_view(view):
    dimensions = []
    for dimension in view.get("dimensions", []):
        if dimension["type"] not in SUPPORTED_DIMENSION_TYPES:
            continue
        dimensions.append(compose_dimension(dimension))
    return dimensions


def compose_dimension(dimension):
    dimension_type = dimension["type"]
    composed = {
        "id": dimension["id"],
        "layer": "dimension",
        "type": dimension_type,
    }
    if dimension_type == "linear":
        composed.update({
            "end_mm": dimension["end_mm"],
            "offset_mm": dimension.get("offset_mm", [0, -8]),
            "start_mm": dimension["start_mm"],
            "text": label_or(dimension, distance_label(dimension["start_mm"], dimension["end_mm"])),
        })
    elif dimension_type == "diameter":
        composed.update({
            "center_mm": dimension["center_mm"],
            "diameter_mm": dimension["diameter_mm"],
            "text": label_or(dimension, f"Dia {fmt_measure(dimension['diameter_mm'])}"),
        })
    elif dimension_type == "radius":
        composed.update({
            "center_mm": dimension["center_mm"],
            "point_mm": dimension["point_mm"],
            "text": label_or(dimension, f"R {distance_label(dimension['center_mm'], dimension['point_mm'])}"),
        })
    elif dimension_type == "hole":
        composed.update({
            "center_mm": dimension["center_mm"],
            "diameter_mm": dimension["diameter_mm"],
            "text": label_or(dimension, f"Hole Dia {fmt_measure(dimension['diameter_mm'])}"),
        })
    elif dimension_type == "center_distance":
        composed.update({
            "centers_mm": dimension["centers_mm"],
            "offset_mm": dimension.get("offset_mm", [0, 8]),
            "text": label_or(dimension, distance_label(dimension["centers_mm"][0], dimension["centers_mm"][1])),
        })
    return composed


def unsupported_dimension_warnings(job):
    warnings = []
    for view in job.get("views", []):
        for dimension in view.get("dimensions", []):
            if dimension["type"] in SUPPORTED_DIMENSION_TYPES:
                continue
            warnings.append({
                "code": "unsupported_dimension",
                "dimension_id": dimension["id"],
                "message": f"Dimension {dimension['id']} type {dimension['type']} is not supported in I4 and was skipped.",
                "view_id": view["id"],
            })
    return warnings


def label_or(dimension, default):
    return dimension.get("label", default)


def distance_label(start, end):
    return fmt_measure(math.dist(start, end))


def fmt_measure(value):
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.3f}".rstrip("0").rstrip(".")
