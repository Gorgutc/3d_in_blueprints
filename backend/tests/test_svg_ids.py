import hashlib
import json
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "backend" / "tests" / "fixtures"
sys.path.insert(0, str(ROOT / "backend" / "src"))

from blueprints_backend import drawing_ir
from blueprints_backend import image_assist
from blueprints_backend import svg_writer


SVG_NS = "{http://www.w3.org/2000/svg}"
TRACE_ATTRIBUTES = {
    "data-dimension-id",
    "data-entity-id",
    "data-overlay-id",
    "data-view-id",
}
LEGACY_STRUCTURAL_DIGESTS = {
    "golden_dimensions_a4.svg": "30ccf23dc94747d56b5cf9bc462379ad67d69890786ce6de68fc9c848e614ba8",
    "golden_gost_a4.svg": "f321072498ff459f8ce52774bd77bb1b523c8b506f59df7c5acc635b63dad3da",
    "golden_image_assist_overlay.svg": "f1a7d48fbf749cc13faacd381685a4055d67eeff6d5a38374941adb70bcd6e65",
    "golden_minimal.svg": "edf365ac5d1b7f9c61aef162bd9535087b68100f7d474eb8eb8359245a455bf7",
}


class SvgIdTests(unittest.TestCase):
    def test_updated_goldens_preserve_legacy_structure_geometry_styles_text_and_order(self):
        candidates = {
            "golden_dimensions_a4.svg": render_job_sheet("dimensions_job.json"),
            "golden_gost_a4.svg": render_job_sheet("gost_job.json"),
            "golden_image_assist_overlay.svg": render_job_overlay("image_assist_job.json"),
            "golden_minimal.svg": render_job_sheet("minimal_job.json"),
        }

        self.assertEqual(
            LEGACY_STRUCTURAL_DIGESTS,
            {
                fixture_name: structural_digest(candidate)
                for fixture_name, candidate in candidates.items()
            },
        )
        for fixture_name, candidate in candidates.items():
            with self.subTest(fixture=fixture_name):
                self.assertEqual(
                    (FIXTURES / fixture_name).read_text(encoding="utf-8"),
                    candidate,
                )

    def test_renderer_uses_injective_namespaces_and_trace_attributes(self):
        drawing = adversarial_drawing_ir()

        first = svg_writer.render(drawing)
        second = svg_writer.render(drawing)

        self.assertEqual(first, second)
        root = ET.fromstring(first)
        identified = [element for element in root.iter() if "id" in element.attrib]
        identifiers = [element.attrib["id"] for element in identified]
        self.assertEqual(len(identifiers), len(set(identifiers)))

        view_id = 'Вид <front> & "one"'
        entity_id = 'общий <id> & "edge"'
        expected_view_dom_id = encoded_id("view", view_id)
        expected_entity_dom_id = scoped_encoded_id("entity", view_id, entity_id)
        self.assertIn(expected_view_dom_id, identifiers)
        self.assertIn(expected_entity_dom_id, identifiers)
        self.assertRegex(expected_view_dom_id, r"^bp-view-x[0-9a-f]+$")
        self.assertRegex(expected_entity_dom_id, r"^bp-entity-x[0-9a-f]+-x[0-9a-f]+$")

        view_element = element_by_id(root, expected_view_dom_id)
        self.assertEqual(view_id, view_element.attrib["data-view-id"])
        entity_element = element_by_id(root, expected_entity_dom_id)
        self.assertEqual(view_id, entity_element.attrib["data-view-id"])
        self.assertEqual(entity_id, entity_element.attrib["data-entity-id"])

        expected_dimension_dom_id = scoped_encoded_id("dimension", view_id, entity_id)
        dimension_parts = [
            element_by_id(root, f"{expected_dimension_dom_id}-{suffix}")
            for suffix in ("ext-start", "ext-end", "line", "text")
        ]
        for element in dimension_parts:
            self.assertEqual(view_id, element.attrib["data-view-id"])
            self.assertEqual(entity_id, element.attrib["data-dimension-id"])

        expected_sheet_element = encoded_id("sheet-element", entity_id)
        self.assertIn(expected_sheet_element, identifiers)
        self.assertNotIn("data-sheet-element-id", element_by_id(root, expected_sheet_element).attrib)

        generated_ids = [
            identifier
            for identifier in identifiers
            if identifier not in {"sheet"}
        ]
        for identifier in generated_ids:
            self.assertRegex(
                identifier,
                r"^bp-(?:sheet-element|view|entity|dimension)-x[0-9a-f]+"
                r"(?:-x[0-9a-f]+)?(?:-(?:center-h|center-v|ext-end|ext-start|leader|line|text))?$",
            )

        self.assertEqual(entity_id, drawing["views"][0]["entities"][0]["id"])
        self.assertEqual(entity_id, drawing["views"][0]["dimensions"][0]["id"])

    def test_all_dimension_part_suffixes_are_fixed_and_namespaced(self):
        job = json.loads((FIXTURES / "dimensions_job.json").read_text(encoding="utf-8"))
        drawing, warnings = drawing_ir.build(job)
        self.assertEqual([], warnings)

        root = ET.fromstring(svg_writer.render(drawing))
        ids = {element.attrib["id"] for element in root.iter() if "id" in element.attrib}
        view_id = "front"
        expected_suffixes = {
            "dim-hole-centers": {"ext-start", "ext-end", "line", "text"},
            "dim-hole-dia": {"leader", "text"},
            "dim-hole-note": {"center-h", "center-v", "leader", "text"},
            "dim-left-radius": {"leader", "text"},
            "dim-width": {"ext-start", "ext-end", "line", "text"},
        }
        expected_ids = {
            f'{scoped_encoded_id("dimension", view_id, dimension_id)}-{suffix}'
            for dimension_id, suffixes in expected_suffixes.items()
            for suffix in suffixes
        }
        self.assertTrue(expected_ids.issubset(ids))

    def test_image_assist_ids_resist_part_collisions_and_preserve_trace(self):
        drawing = adversarial_drawing_ir()
        drawing["image_assist"] = {
            "mode": "assistive",
            "overlays": [
                {
                    "id": 'контур <&"',
                    "points_rel": [[0.1, 0.1], [0.9, 0.1]],
                    "type": "contour",
                },
                {
                    "center_rel": [0.5, 0.5],
                    "id": "measure-line",
                    "primitive": "circle",
                    "radius_rel": 0.1,
                    "type": "primitive_hint",
                },
                {
                    "end_rel": [0.9, 0.8],
                    "id": "measure",
                    "label": "1.00 rel",
                    "start_rel": [0.1, 0.8],
                    "type": "relative_dimension",
                },
            ],
            "scale": {"kind": "relative"},
            "units": "relative",
        }

        first = image_assist.render_overlay(drawing)
        self.assertEqual(first, image_assist.render_overlay(drawing))
        root = ET.fromstring(first)
        elements = [element for element in root.iter() if "id" in element.attrib]
        ids = [element.attrib["id"] for element in elements]
        self.assertEqual(len(ids), len(set(ids)))

        logical_id = 'контур <&"'
        contour = element_by_id(root, encoded_id("overlay", logical_id))
        self.assertEqual(logical_id, contour.attrib["data-overlay-id"])
        measure_base = encoded_id("overlay", "measure")
        for suffix in ("line", "text"):
            element = element_by_id(root, f"{measure_base}-{suffix}")
            self.assertEqual("measure", element.attrib["data-overlay-id"])
        self.assertIn(encoded_id("overlay", "measure-line"), ids)
        self.assertNotEqual(encoded_id("overlay", "measure-line"), f"{measure_base}-line")

        for identifier in ids:
            if identifier == "image-assist-overlay":
                continue
            self.assertRegex(identifier, r"^bp-overlay-x[0-9a-f]+(?:-(?:line|text))?$")

    def test_renderer_rejects_xml_1_0_incompatible_text_without_sanitizing(self):
        for unsafe in ("\x00", "\x08", "\ud800", "\ufffe"):
            with self.subTest(codepoint=ascii(unsafe)):
                drawing = adversarial_drawing_ir()
                drawing["source_job_id"] = f"unsafe{unsafe}text"

                with self.assertRaises(ValueError) as raised:
                    svg_writer.render(drawing)

                self.assertEqual("invalid_text", raised.exception.code)
                self.assertIn("XML 1.0", raised.exception.message)

    def test_renderer_rejects_non_stroked_entity_layer_as_controlled_error(self):
        invalid_styles = {
            "missing stroke": {"stroke_width": 0.35},
            "empty stroke": {"stroke": "", "stroke_width": 0.35},
            "whitespace stroke": {"stroke": " ", "stroke_width": 0.35},
            "missing width": {"stroke": "#111111"},
            "zero width": {"stroke": "#111111", "stroke_width": 0},
            "non-finite width": {"stroke": "#111111", "stroke_width": float("nan")},
            "boolean width": {"stroke": "#111111", "stroke_width": True},
        }
        for case, invalid_style in invalid_styles.items():
            with self.subTest(case=case):
                drawing = adversarial_drawing_ir()
                visible_layer = next(
                    layer for layer in drawing["layers"] if layer["id"] == "visible"
                )
                visible_layer.clear()
                visible_layer.update({"id": "visible", **invalid_style})

                with self.assertRaises(ValueError) as raised:
                    svg_writer.render(drawing)

                self.assertEqual("invalid_entity", raised.exception.code)
                self.assertEqual(
                    "line entity.layer must provide stroke and positive stroke_width styles.",
                    raised.exception.message,
                )

    def test_image_assist_rejects_xml_1_0_incompatible_text(self):
        drawing = adversarial_drawing_ir()
        drawing["image_assist"] = {
            "mode": "assistive",
            "overlays": [{
                "end_rel": [0.9, 0.8],
                "id": "measure",
                "label": "bad\x08label",
                "start_rel": [0.1, 0.8],
                "type": "relative_dimension",
            }],
            "scale": {"kind": "relative"},
            "units": "relative",
        }

        with self.assertRaises(ValueError) as raised:
            image_assist.render_overlay(drawing)

        self.assertEqual("invalid_text", raised.exception.code)

    def test_valid_xml_unicode_and_whitespace_remain_parseable(self):
        drawing = adversarial_drawing_ir()
        drawing["source_job_id"] = "Blueprint\tline one\nline two\rПример"

        rendered = svg_writer.render(drawing)

        self.assertIsNotNone(ET.fromstring(rendered))


def adversarial_drawing_ir():
    shared_id = 'общий <id> & "edge"'
    first_view_id = 'Вид <front> & "one"'
    return {
        "layers": [
            {"id": "dimension", "fill": "#111111", "stroke": "#111111", "stroke_width": 0.25},
            {"id": "frame", "stroke": "#111111", "stroke_width": 0.7},
            {"id": "text", "fill": "#111111"},
            {"id": "visible", "stroke": "#111111", "stroke_width": 0.35},
        ],
        "schema_version": "1.0",
        "sheet": {"format": "A4", "height_mm": 297, "standard": "GOST", "width_mm": 210},
        "sheet_elements": [
            {
                "height_mm": 10,
                "id": shared_id,
                "layer": "frame",
                "type": "rect",
                "width_mm": 10,
                "x_mm": 1,
                "y_mm": 2,
            },
            {
                "font_family": "monospace",
                "font_size_mm": 3.5,
                "id": "measure-line",
                "layer": "text",
                "text": "ГОСТ trace",
                "type": "text",
                "x_mm": 3,
                "y_mm": 4,
            },
        ],
        "standards": {"fastener_matches": [], "sources": []},
        "source_job_id": "svg-id-adversarial",
        "units": "mm",
        "views": [
            make_view(first_view_id, shared_id, origin=[20, 30]),
            make_view("top", shared_id, origin=[100, 30]),
        ],
    }


def make_view(view_id, shared_id, origin):
    return {
        "dimensions": [
            {
                "end_mm": [10, 0],
                "id": shared_id,
                "layer": "dimension",
                "offset_mm": [0, -5],
                "start_mm": [0, 0],
                "text": "10",
                "type": "linear",
            },
            {
                "center_mm": [5, 5],
                "diameter_mm": 2,
                "id": "measure",
                "layer": "dimension",
                "text": "Dia 2",
                "type": "diameter",
            },
        ],
        "entities": [
            {
                "end_mm": [10, 0],
                "id": shared_id,
                "layer": "visible",
                "start_mm": [0, 0],
                "type": "line",
            },
            {
                "end_mm": [10, 5],
                "id": "measure-line",
                "layer": "visible",
                "start_mm": [0, 5],
                "type": "line",
            },
        ],
        "id": view_id,
        "label": view_id,
        "origin_mm": origin,
        "scale": 1,
    }


def render_job_sheet(fixture_name):
    drawing, warnings = build_fixture_drawing_ir(fixture_name)
    if warnings:
        raise AssertionError(
            f"Fixture {fixture_name} produced unexpected warnings: {warnings!r}"
        )
    return svg_writer.render(drawing)


def render_job_overlay(fixture_name):
    drawing, warnings = build_fixture_drawing_ir(fixture_name)
    if warnings:
        raise AssertionError(
            f"Fixture {fixture_name} produced unexpected warnings: {warnings!r}"
        )
    return image_assist.render_overlay(drawing)


def build_fixture_drawing_ir(fixture_name):
    job = json.loads((FIXTURES / fixture_name).read_text(encoding="utf-8"))
    return drawing_ir.build(job)


def encoded_id(kind, logical_id):
    return f'bp-{kind}-x{logical_id.encode("utf-8").hex()}'


def scoped_encoded_id(kind, scope_id, logical_id):
    return f'{encoded_id(kind, scope_id)}-x{logical_id.encode("utf-8").hex()}'


def element_by_id(root, identifier):
    for element in root.iter():
        if element.attrib.get("id") == identifier:
            return element
    raise AssertionError(f"SVG element {identifier!r} was not found.")


def structural_signature(svg):
    root = ET.fromstring(svg)

    def visit(element):
        attributes = tuple(sorted(
            (name, value)
            for name, value in element.attrib.items()
            if name != "id" and name not in TRACE_ATTRIBUTES
        ))
        text = element.text if element.text and element.text.strip() else None
        return (
            element.tag,
            attributes,
            text,
            tuple(visit(child) for child in element),
        )

    return visit(root)


def structural_digest(svg):
    serialized = json.dumps(
        structural_signature(svg),
        ensure_ascii=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


if __name__ == "__main__":
    unittest.main()
