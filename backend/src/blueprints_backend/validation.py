import math


class JobError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


DomainValidationError = JobError


def is_xml_1_0_text(value):
    if not isinstance(value, str):
        return False
    return all(is_xml_1_0_character(character) for character in value)


def is_xml_1_0_character(character):
    codepoint = ord(character)
    return (
        codepoint in {0x09, 0x0A, 0x0D}
        or 0x20 <= codepoint <= 0xD7FF
        or 0xE000 <= codepoint <= 0xFFFD
        or 0x10000 <= codepoint <= 0x10FFFF
    )


def require_xml_1_0_text(value, context="text"):
    if not is_xml_1_0_text(value):
        raise DomainValidationError(
            "invalid_text",
            f"{context} contains text incompatible with XML 1.0.",
        )


def require_stroked_line_layer(layer):
    valid = (
        isinstance(layer, dict)
        and isinstance(layer.get("stroke"), str)
        and bool(layer["stroke"].strip())
        and is_number(layer.get("stroke_width"))
        and layer["stroke_width"] > 0
    )
    if not valid:
        raise DomainValidationError(
            "invalid_entity",
            "line entity.layer must provide stroke and positive stroke_width styles.",
        )


def is_number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )
