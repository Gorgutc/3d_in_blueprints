FRAME_LEFT_MM = 20
FRAME_TOP_MM = 5
FRAME_RIGHT_MM = 5
FRAME_BOTTOM_MM = 5
TITLE_BLOCK_HEIGHT_MM = 55
TITLE_TEXT_Y_OFFSET_MM = 7


def compose_sheet(job):
    sheet = job["sheet"]
    width = sheet["width_mm"]
    height = sheet["height_mm"]
    frame = {
        "height_mm": height - FRAME_TOP_MM - FRAME_BOTTOM_MM,
        "width_mm": width - FRAME_LEFT_MM - FRAME_RIGHT_MM,
        "x_mm": FRAME_LEFT_MM,
        "y_mm": FRAME_TOP_MM,
    }
    title_block = {
        "height_mm": TITLE_BLOCK_HEIGHT_MM,
        "width_mm": frame["width_mm"],
        "x_mm": frame["x_mm"],
        "y_mm": frame["y_mm"] + frame["height_mm"] - TITLE_BLOCK_HEIGHT_MM,
    }
    drawing_area = {
        "height_mm": title_block["y_mm"] - frame["y_mm"],
        "width_mm": frame["width_mm"],
        "x_mm": frame["x_mm"],
        "y_mm": frame["y_mm"],
    }
    metadata = title_metadata(sheet.get("title_block", {}), job)

    return {
        "sheet": {
            "drawing_area_mm": drawing_area,
            "frame_mm": frame,
            "standard": "GOST",
            "title_block_mm": title_block,
        },
        "sheet_elements": [
            rect("gost-frame", "frame", frame),
            rect("gost-title-block", "frame", title_block),
            *title_grid(title_block),
            text("gost-title-name", title_block["x_mm"] + 3, title_block["y_mm"] + TITLE_TEXT_Y_OFFSET_MM, metadata["title"]),
            text(
                "gost-title-designation",
                title_block["x_mm"] + 68,
                title_block["y_mm"] + TITLE_TEXT_Y_OFFSET_MM,
                metadata["designation"],
            ),
            text(
                "gost-title-scale",
                title_block["x_mm"] + 128,
                title_block["y_mm"] + TITLE_TEXT_Y_OFFSET_MM,
                f"Scale {metadata['scale']}",
            ),
            text(
                "gost-title-sheet",
                title_block["x_mm"] + 148,
                title_block["y_mm"] + TITLE_TEXT_Y_OFFSET_MM,
                f"Sheet {metadata['sheet']}/{metadata['sheets']}",
            ),
        ],
    }


def title_metadata(title_block, job):
    return {
        "designation": str(title_block.get("designation", job["job_id"])),
        "scale": str(title_block.get("scale", first_view_scale(job))),
        "sheet": str(title_block.get("sheet", "1")),
        "sheets": str(title_block.get("sheets", "1")),
        "title": str(title_block.get("title", job["job_id"])),
    }


def first_view_scale(job):
    views = job.get("views") or []
    if not views:
        return "1:1"
    scale = views[0].get("scale", 1)
    if scale == 1:
        return "1:1"
    return f"{scale}:1"


def title_grid(title_block):
    x = title_block["x_mm"]
    y = title_block["y_mm"]
    width = title_block["width_mm"]
    height = title_block["height_mm"]
    return [
        line(f"gost-title-row-{index}", "thin", [x, y + offset], [x + width, y + offset])
        for index, offset in enumerate((10, 20, 30, 40), start=1)
    ] + [
        line(f"gost-title-col-{index}", "thin", [x + offset, y], [x + offset, y + height])
        for index, offset in enumerate((65, 125, 145), start=1)
    ]


def rect(element_id, layer, box):
    return {
        "height_mm": box["height_mm"],
        "id": element_id,
        "layer": layer,
        "type": "rect",
        "width_mm": box["width_mm"],
        "x_mm": box["x_mm"],
        "y_mm": box["y_mm"],
    }


def line(element_id, layer, start, end):
    return {
        "end_mm": end,
        "id": element_id,
        "layer": layer,
        "start_mm": start,
        "type": "line",
    }


def text(element_id, x, y, body):
    return {
        "font_family": "monospace",
        "font_size_mm": 3.5,
        "id": element_id,
        "layer": "text",
        "text": body,
        "type": "text",
        "x_mm": x,
        "y_mm": y,
    }
