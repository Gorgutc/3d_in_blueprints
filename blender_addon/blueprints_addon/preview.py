from pathlib import Path


DIAGNOSTICS_TEXT_NAME = "Blueprints Diagnostics"
SVG_TEXT_NAME = "Blueprints SVG Preview"


def load_outputs_into_text_blocks(bpy_module, job_dir):
    root = Path(job_dir)
    loaded = {}
    diagnostics = root / "diagnostics.json"
    svg = root / "sheet.svg"

    if diagnostics.exists():
        loaded["diagnostics"] = write_text_block(
            bpy_module,
            DIAGNOSTICS_TEXT_NAME,
            diagnostics.read_text(encoding="utf-8"),
        )
    if svg.exists():
        loaded["svg"] = write_text_block(
            bpy_module,
            SVG_TEXT_NAME,
            svg.read_text(encoding="utf-8"),
        )
    return loaded


def write_text_block(bpy_module, name, body):
    text = bpy_module.data.texts.get(name) or bpy_module.data.texts.new(name)
    text.clear()
    text.write(body)
    return text
