from .validation import DomainValidationError, require_xml_1_0_text


DOM_ID_KINDS = frozenset({
    "dimension",
    "entity",
    "overlay",
    "sheet-element",
    "view",
})


def dom_id(kind, *logical_ids):
    if kind not in DOM_ID_KINDS:
        raise ValueError(f"Unsupported SVG DOM id kind {kind}.")
    if not logical_ids:
        raise ValueError("SVG DOM ids require at least one logical id.")

    encoded_ids = []
    for logical_id in logical_ids:
        require_xml_1_0_text(logical_id, context=f"SVG {kind} logical id")
        if not logical_id:
            raise DomainValidationError(
                "invalid_text",
                f"SVG {kind} logical id must be non-empty.",
            )
        encoded_ids.append(f'x{logical_id.encode("utf-8").hex()}')
    return f'bp-{kind}-{"-".join(encoded_ids)}'
