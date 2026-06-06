from . import dimensions, gost


LAYER_STYLES = {
    "dimension": {
        "fill": "#111111",
        "stroke": "#111111",
        "stroke_width": 0.25,
    },
    "frame": {
        "stroke": "#111111",
        "stroke_width": 0.7,
    },
    "hidden": {
        "stroke": "#111111",
        "stroke_dasharray": "3 2",
        "stroke_width": 0.25,
    },
    "text": {
        "fill": "#111111",
    },
    "thin": {
        "stroke": "#111111",
        "stroke_width": 0.25,
    },
    "visible": {
        "stroke": "#111111",
        "stroke_width": 0.35,
    },
}


def build(job):
    if "views" not in job:
        return build_scene_placeholder(job)

    sheet, sheet_elements = compose_sheet(job)
    view_dimensions = [
        dimensions.compose_view(view)
        for view in job["views"]
    ]
    layer_ids = sorted({
        entity["layer"]
        for view in job["views"]
        for entity in view["entities"]
        if entity["type"] == "line"
    } | {
        element["layer"]
        for element in sheet_elements
    } | {
        dimension["layer"]
        for dimension_list in view_dimensions
        for dimension in dimension_list
    })
    warnings = unsupported_entity_warnings(job) + dimensions.unsupported_dimension_warnings(job)

    return {
        "layers": [
            {"id": layer_id, **LAYER_STYLES.get(layer_id, default_style())}
            for layer_id in layer_ids
        ],
        "schema_version": "1.0",
        "sheet": sheet,
        "sheet_elements": sheet_elements,
        "source_job_id": job["job_id"],
        "units": "mm",
        "views": [
            {
                "entities": [
                    {
                        "end_mm": entity["end_mm"],
                        "id": entity["id"],
                        "layer": entity["layer"],
                        "start_mm": entity["start_mm"],
                        "type": entity["type"],
                    }
                    for entity in view["entities"]
                    if entity["type"] == "line"
                ],
                "dimensions": view_dimensions[index],
                "id": view["id"],
                "label": view.get("label", view["id"]),
                "origin_mm": view["origin_mm"],
                "scale": view["scale"],
            }
            for index, view in enumerate(job["views"])
        ],
    }, warnings


def build_scene_placeholder(job):
    sheet, sheet_elements = compose_sheet(job)
    return {
        "layers": [
            {"id": layer_id, **LAYER_STYLES.get(layer_id, default_style())}
            for layer_id in sorted({
                element["layer"]
                for element in sheet_elements
            })
        ],
        "schema_version": "1.0",
        "sheet": sheet,
        "sheet_elements": sheet_elements,
        "source_job_id": job["job_id"],
        "units": "mm",
        "views": [
            {
                "dimensions": [],
                "entities": [],
                "id": "front",
                "label": "Front",
                "origin_mm": [20, 20],
                "scale": 1,
            }
        ],
    }, [
        {
            "code": "projection_pending",
            "message": "SceneSnapshot projection is not implemented in I2; backend emitted an empty placeholder view.",
            "source": job["source"]["scene_snapshot"],
        }
    ]


def compose_sheet(job):
    sheet = {
        "format": job["sheet"]["format"],
        "height_mm": job["sheet"]["height_mm"],
        "width_mm": job["sheet"]["width_mm"],
    }
    if job["sheet"].get("standard") != "GOST":
        return sheet, []

    composition = gost.compose_sheet(job)
    sheet.update(composition["sheet"])
    return sheet, composition["sheet_elements"]


def unsupported_entity_warnings(job):
    warnings = []
    for view in job.get("views", []):
        for entity in view["entities"]:
            if entity["type"] == "line":
                continue
            warnings.append({
                "code": "unsupported_entity",
                "entity_id": entity["id"],
                "message": f"Entity {entity['id']} type {entity['type']} is not supported in I1 and was skipped.",
                "view_id": view["id"],
            })
    return warnings


def default_style():
    return {
        "stroke": "#111111",
        "stroke_width": 0.35,
    }
