from pathlib import Path


DIAGNOSTICS_TEXT_NAME = "Blueprints Diagnostics"
SVG_TEXT_NAME = "Blueprints SVG Preview"
TEXT_OUTPUTS = {
    "diagnostics": DIAGNOSTICS_TEXT_NAME,
    "svg": SVG_TEXT_NAME,
}


def clear_output_text_blocks(bpy_module):
    return {
        output_name: write_text_block(bpy_module, text_name, "")
        for output_name, text_name in TEXT_OUTPUTS.items()
    }


def load_outputs_into_text_blocks(bpy_module, approved_outputs):
    loaded = {}
    for output_name, text_name in TEXT_OUTPUTS.items():
        approved_path = approved_outputs.get(output_name)
        if approved_path is None:
            continue
        path = Path(approved_path)
        loaded[output_name] = write_text_block(
            bpy_module,
            text_name,
            path.read_text(encoding="utf-8"),
        )
    return loaded


def write_text_block(bpy_module, name, body):
    text = bpy_module.data.texts.get(name) or bpy_module.data.texts.new(name)
    text.clear()
    text.write(body)
    return text
