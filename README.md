# 3d_in_blueprints

Blender add-on + local standalone backend for generating blueprint-style
technical drawings from 3D scene data.

## Current State

- Product scope: Blender add-on thin client + Python-first local backend.
- Active profile: `blender-addon`.
- Dormant profile: `windows-exe`, until a future Windows executable packaging
  request explicitly activates it.
- Implemented slices: I1 backend CLI + DrawingIR + deterministic SVG +
  diagnostics; I2 Blender Bridge thin-client smoke; I3 GOST Composer v1;
  I4 Dimensions v1; I5 Standards DB v1; I6 Image Assist v1; I7 Packaging +
  Hardening.
- Not implemented yet: FreeCAD/TechDraw execution, DXF/PDF, DWG, installers,
  Windows executable packaging.

## Backend I1 Contract

The backend is currently a stdlib-only Python package under
`backend/src/blueprints_backend`.

Run it with a job folder:

```bash
python -m blueprints_backend <job-folder>
```

The job folder contract is:

- input: `job.json`
- outputs: `drawing_ir.json`, `sheet.svg`, `diagnostics.json`

I1 supports line entities in DrawingIR. Unsupported entity types are skipped and
reported as diagnostics warnings when a valid sheet can still be emitted.

## Blender I2 Bridge

The Blender add-on source lives under `blender_addon/blueprints_addon`.

I2 provides:

- `bl_info` for Blender 5.1;
- add-on preferences for backend Python, backend source, job root, export
  format, and timeout;
- SceneSnapshot JSON export for visible scene objects;
- OBJ or GLB scene asset export into the backend job folder;
- backend launch through `<python> -m blueprints_backend <job-folder>`;
- backend-side placeholder DrawingIR for SceneSnapshot jobs until projection is
  implemented;
- preview import by loading `diagnostics.json` and `sheet.svg` into Blender Text
  data-blocks.

I2 does not add add-on packaging, FreeCAD/TechDraw execution, CAD projection, or
DXF/PDF/DWG exports.

## GOST I3 Composer

The backend now supports an opt-in GOST v1 sheet composer through
`sheet.standard: "GOST"` in `job.json`.

I3 provides:

- A4 GOST frame margins;
- backend-owned title block grid and title metadata rendering;
- DrawingIR `sheet_elements` for frame, title block lines, and text;
- GOST line layers for frame, thin grid lines, text, visible geometry, and
  hidden geometry;
- deterministic golden SVG coverage for GOST output.

The Blender bridge requests GOST sheet composition in its backend job payload
but still does not synthesize drawing entities. I3 does not add FreeCAD/TechDraw
projection, dimensions, standards DB, image assist, packaging, or derived
DXF/PDF/DWG exports.

## Dimensions I4 V1

The backend now supports explicit basic dimension annotations on each view
through `view.dimensions[]` in `job.json`.

I4 provides:

- DrawingIR dimension records on a dedicated `dimension` layer;
- deterministic SVG rendering for basic linear, diameter, radius, hole, and
  center-distance annotations;
- backend validation for supported dimension payloads;
- diagnostics warnings for unsupported dimension types, which are skipped while
  valid supported dimensions still render;
- golden SVG coverage for a dimensioned A4 GOST job.

I4 does not infer dimensions from projected geometry, does not add angular or
ordinate dimensions, tolerances, detailed GOST dimension rules, standards DB,
image assist, packaging, or derived DXF/PDF/DWG exports.

## Standards DB I5 V1

The backend now supports a narrow, backend-owned fastener standards matcher
through `standards.fastener_matches[]` in `job.json`.

I5 provides:

- a local stdlib-only starter fastener catalog for `bolt`, `nut`, and `washer`
  families;
- explicit source and license metadata for the starter catalog;
- matcher output in DrawingIR and diagnostics under `standards`;
- diagnostics warnings for unsupported fastener families and unmatched nominal
  diameters;
- backend validation for fastener match request payloads;
- backend tests covering matches, warnings, and unchanged SVG output.

The starter data is project-authored, non-normative metadata for matcher
plumbing; no third-party standards table is copied. I5 does not add exact
standards geometry, automatic fastener detection, BOM generation, image assist,
packaging, FreeCAD/TechDraw execution, or derived DXF/PDF/DWG exports.

## Image Assist I6 V1

The backend now supports explicit assistive image overlays through
`image_assist` in `job.json`.

I6 provides:

- assistive mode only, with no automatic absolute measurement inference;
- relative contour overlays through `contour.points_rel`;
- relative primitive hints for circle candidates;
- relative dimension hints through `relative_dimension` overlays;
- a deterministic `assist_overlay.svg` output listed in diagnostics as
  `image_assist_overlay`;
- DrawingIR `image_assist` records using relative units;
- validation that rejects absolute `*_mm` overlay coordinates unless
  `scale.reference_mm_per_unit` is explicitly provided;
- diagnostics warnings for unsupported overlay or primitive types, which are
  skipped while valid assist overlays still render.

I6 is stdlib-only and does not add computer-vision dependencies, image
classification, automatic scale calibration, FreeCAD/TechDraw execution,
packaging, or derived DXF/PDF/DWG exports.

## Packaging + Hardening I7

The repository now has stdlib-only release packaging for the active Blender
add-on + backend scope.

I7 provides:

- add-on zip packaging from `blender_addon/blueprints_addon`;
- backend bundle zip packaging from `backend/src/blueprints_backend`;
- version-stamped `release_manifest.json`;
- backend `crash.log` output for unexpected exceptions, referenced from
  `diagnostics.json`;
- a Windows/Linux CI matrix for `npm run codex:ship`;
- packaging docs in `docs/release/packaging.md`;
- a smoke command that writes generated artifacts only to a temporary folder.

Run the packaging smoke:

```bash
npm run test:packaging
```

Create local release artifacts when needed:

```bash
python scripts/package_release.py --output-dir dist
```

Generated release folders and zips must not be committed. I7 does not add
installers, code signing, Windows executable packaging, FreeCAD/TechDraw
execution, OCCT/C++ builds, or derived DXF/PDF/DWG exports.

## Verification

Node is used as the repository verification command harness, not as the product
runtime.

```bash
npm run test:backend
npm run test:blender
npm run test:packaging
npm run codex:ship
```

`codex:ship` runs the Codex infrastructure gates plus the stdlib backend and
bridge unit tests plus packaging smoke through `quality:deep`. `test:blender`
is an explicit local Blender 5.1 background smoke; set `BLENDER_EXE` when
Blender 5.1 is not on the standard Windows install path.

## Handoff

Iteration state is recorded in `docs/handoff/ITERATION_LOG.md`. Update it after
each completed, failed, or blocked iteration before continuing in a new session.
