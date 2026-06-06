import json
from pathlib import Path

from . import dimensions


SUPPORTED_FASTENER_FAMILIES = {
    "bolt",
    "nut",
    "washer",
}


DATA_PATH = Path(__file__).with_name("data") / "standards_fasteners.json"


def load_catalog():
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def match_job(job):
    standards_payload = job.get("standards") or {}
    requests = standards_payload.get("fastener_matches", [])
    if not requests:
        return {
            "fastener_matches": [],
            "sources": [],
        }, []

    catalog = load_catalog()
    matches = []
    warnings = []
    for request in requests:
        family = request["family"]
        if family not in SUPPORTED_FASTENER_FAMILIES:
            warnings.append(unsupported_family_warning(request))
            continue

        if not reference_exists(job, request):
            warnings.append(reference_not_found_warning(request))
            continue

        entry = find_fastener(catalog, family, request["nominal_diameter_mm"])
        if entry is None:
            warnings.append(match_not_found_warning(request))
            continue

        matches.append({
            "dimension_id": request["dimension_id"],
            "entry": entry,
            "request_id": request["id"],
            "view_id": request["view_id"],
        })

    return {
        "fastener_matches": matches,
        "sources": used_sources(catalog, matches),
    }, warnings


def find_fastener(catalog, family, nominal_diameter_mm):
    for entry in catalog["fasteners"]:
        if entry["family"] == family and entry["nominal_diameter_mm"] == nominal_diameter_mm:
            return entry
    return None


def reference_exists(job, request):
    for view in job.get("views", []):
        if view["id"] != request["view_id"]:
            continue
        return any(
            dimension["id"] == request["dimension_id"]
            and dimension["type"] in dimensions.SUPPORTED_DIMENSION_TYPES
            for dimension in view.get("dimensions", [])
        )
    return False


def used_sources(catalog, matches):
    used_source_ids = {
        match["entry"]["source_id"]
        for match in matches
    }
    return [
        source
        for source in catalog["sources"]
        if source["id"] in used_source_ids
    ]


def unsupported_family_warning(request):
    family = request["family"]
    return {
        "code": "unsupported_standard_family",
        "family": family,
        "message": f"Fastener family {family} is not supported in I5 and was skipped.",
        "standard_match_id": request["id"],
    }


def match_not_found_warning(request):
    family = request["family"]
    nominal_diameter = request["nominal_diameter_mm"]
    return {
        "code": "standard_match_not_found",
        "family": family,
        "message": f"No I5 standards DB fastener matched family {family} with nominal diameter {dimensions.fmt_measure(nominal_diameter)} mm.",
        "nominal_diameter_mm": nominal_diameter,
        "standard_match_id": request["id"],
    }


def reference_not_found_warning(request):
    return {
        "code": "standard_reference_not_found",
        "dimension_id": request["dimension_id"],
        "message": f"Standard match {request['id']} references missing view or dimension and was skipped.",
        "standard_match_id": request["id"],
        "view_id": request["view_id"],
    }
