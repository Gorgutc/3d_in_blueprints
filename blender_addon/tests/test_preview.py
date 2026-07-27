import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PREVIEW_PATH = ROOT / "blender_addon" / "blueprints_addon" / "preview.py"


def load_preview():
    spec = importlib.util.spec_from_file_location(
        "blueprints_preview_under_test",
        PREVIEW_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


preview = load_preview()


class FakeText:
    def __init__(self):
        self.body = ""

    def clear(self):
        self.body = ""

    def write(self, body):
        self.body += body


class FakeTexts:
    def __init__(self):
        self._items = {}

    def get(self, name):
        return self._items.get(name)

    def new(self, name):
        text = FakeText()
        self._items[name] = text
        return text


class FakeBpy:
    def __init__(self):
        self.data = type("Data", (), {"texts": FakeTexts()})()


class PreviewTests(unittest.TestCase):
    def test_clear_output_text_blocks_creates_and_invalidates_both_blocks(self):
        bpy_module = FakeBpy()

        cleared = preview.clear_output_text_blocks(bpy_module)

        self.assertEqual(
            {"diagnostics", "svg"},
            set(cleared),
        )
        self.assertEqual(
            "",
            bpy_module.data.texts.get(preview.DIAGNOSTICS_TEXT_NAME).body,
        )
        self.assertEqual(
            "",
            bpy_module.data.texts.get(preview.SVG_TEXT_NAME).body,
        )

    def test_success_then_failure_clears_stale_svg_and_loads_current_diagnostics_only(self):
        bpy_module = FakeBpy()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            success_root = root / "success"
            failure_root = root / "failure"
            success_root.mkdir()
            failure_root.mkdir()
            success_diagnostics = success_root / "diagnostics.json"
            success_svg = success_root / "sheet.svg"
            failure_diagnostics = failure_root / "diagnostics.json"
            unapproved_svg = failure_root / "sheet.svg"
            success_diagnostics.write_text('{"status":"ok"}\n', encoding="utf-8")
            success_svg.write_text("<svg>current</svg>\n", encoding="utf-8")
            failure_diagnostics.write_text('{"status":"error"}\n', encoding="utf-8")
            unapproved_svg.write_text("<svg>must-not-load</svg>\n", encoding="utf-8")

            preview.clear_output_text_blocks(bpy_module)
            preview.load_outputs_into_text_blocks(
                bpy_module,
                {
                    "diagnostics": success_diagnostics,
                    "svg": success_svg,
                },
            )
            self.assertEqual(
                "<svg>current</svg>\n",
                bpy_module.data.texts.get(preview.SVG_TEXT_NAME).body,
            )

            preview.clear_output_text_blocks(bpy_module)
            loaded = preview.load_outputs_into_text_blocks(
                bpy_module,
                {"diagnostics": failure_diagnostics},
            )

        self.assertEqual({"diagnostics"}, set(loaded))
        self.assertEqual(
            '{"status":"error"}\n',
            bpy_module.data.texts.get(preview.DIAGNOSTICS_TEXT_NAME).body,
        )
        self.assertEqual(
            "",
            bpy_module.data.texts.get(preview.SVG_TEXT_NAME).body,
        )


if __name__ == "__main__":
    unittest.main()
