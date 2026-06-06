import math

from . import dimensions, svg_writer

SUPPORTED_OVERLAY_TYPES = {
    "contour",
    "primitive_hint",
    "relative_dimension",
}

SUPPORTED_PRIMITIVES = {
    "circle",
}


def compose(job):
    payload = job.get("image_assist")
    if payload is None:
        return None, []

    overlays = []
    warnings = []
    for overlay in payload["overlays"]:
        if overlay["type"] not in SUPPORTED_OVERLAY_TYPES:
            warnings.append(unsupported_overlay_warning(overlay))
            continue
        if overlay["type"] == "primitive_hint" and overlay["primitive"] not in SUPPORTED_PRIMITIVES:
            warnings.append(unsupported_primitive_warning(overlay))
            continue
        overlays.append(compose_overlay(overlay))

    return {
        "mode": "assistive",
        "overlays": overlays,
        "scale": {
            "kind": "relative",
        },
        "units": "relative",
    }, warnings


def compose_overlay(overlay):
    overlay_type = overlay["type"]
    composed = {
        "id": overlay["id"],
        "type": overlay_type,
    }
    if overlay_type == "contour":
        composed["points_rel"] = overlay["points_rel"]
    elif overlay_type == "primitive_hint":
        composed.update({
            "center_rel": overlay["center_rel"],
            "primitive": overlay["primitive"],
            "radius_rel": overlay["radius_rel"],
        })
    elif overlay_type == "relative_dimension":
        composed.update({
            "end_rel": overlay["end_rel"],
            "label": overlay.get("label", relative_distance_label(overlay["start_rel"], overlay["end_rel"])),
            "start_rel": overlay["start_rel"],
        })
    return composed


def render_overlay(drawing_ir):
    assist = drawing_ir["image_assist"]
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">',
        f'  <title>{escape_text(drawing_ir["source_job_id"])} image assist overlay</title>',
        "  <desc>Assistive relative overlay; absolute dimensions require an explicit scale.</desc>",
        f'  <g id="image-assist-overlay" data-mode="{escape_attr(assist["mode"])}" data-units="{escape_attr(assist["units"])}">',
    ]

    for overlay in assist["overlays"]:
        if overlay["type"] == "contour":
            lines.append(render_contour(overlay))
        elif overlay["type"] == "primitive_hint":
            lines.append(render_primitive_hint(overlay))
        elif overlay["type"] == "relative_dimension":
            lines.extend(render_relative_dimension(overlay))

    lines.extend(["  </g>", "</svg>", ""])
    return "\n".join(lines)


def render_contour(overlay):
    points = " ".join(
        f"{fmt(point[0])},{fmt(point[1])}"
        for point in overlay["points_rel"]
    )
    return (
        f'    <polyline id="{escape_attr(overlay["id"])}" points="{points}" '
        'fill="none" stroke="#0072ce" stroke-width="0.01" />'
    )


def render_primitive_hint(overlay):
    return (
        f'    <circle id="{escape_attr(overlay["id"])}" data-primitive="{escape_attr(overlay["primitive"])}" '
        f'cx="{fmt(overlay["center_rel"][0])}" cy="{fmt(overlay["center_rel"][1])}" r="{fmt(overlay["radius_rel"])}" '
        'fill="none" stroke="#b45f06" stroke-width="0.01" />'
    )


def render_relative_dimension(overlay):
    start = overlay["start_rel"]
    end = overlay["end_rel"]
    text_x = (start[0] + end[0]) / 2
    text_y = min(start[1], end[1]) - 0.02
    return [
        (
            f'    <line id="{escape_attr(overlay["id"])}-line" x1="{fmt(start[0])}" y1="{fmt(start[1])}" '
            f'x2="{fmt(end[0])}" y2="{fmt(end[1])}" fill="none" stroke="#111111" '
            'stroke-width="0.008" stroke-linecap="round" />'
        ),
        (
            f'    <text id="{escape_attr(overlay["id"])}-text" x="{fmt(text_x)}" y="{fmt(text_y)}" '
            'font-size="0.035" font-family="monospace" fill="#111111" text-anchor="middle">'
            f'{escape_text(overlay["label"])}</text>'
        ),
    ]


def unsupported_overlay_warning(overlay):
    overlay_id = overlay["id"]
    overlay_type = overlay["type"]
    return {
        "code": "unsupported_image_assist_overlay",
        "image_assist_overlay_id": overlay_id,
        "message": f"Image assist overlay {overlay_id} type {overlay_type} is not supported in I6 and was skipped.",
    }


def unsupported_primitive_warning(overlay):
    overlay_id = overlay["id"]
    primitive = overlay["primitive"]
    return {
        "code": "unsupported_image_assist_primitive",
        "image_assist_overlay_id": overlay_id,
        "message": f"Image assist primitive {primitive} in overlay {overlay_id} is not supported in I6 and was skipped.",
    }


def relative_distance_label(start, end):
    return f"{dimensions.fmt_measure(math.dist(start, end))} rel"


fmt = svg_writer.fmt
escape_text = svg_writer.escape_text
escape_attr = svg_writer.escape_attr
