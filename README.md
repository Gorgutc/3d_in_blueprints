# 3d_in_blueprints

Blender add-on + local standalone backend for generating blueprint-style
technical drawings from 3D scene data.

## Current State

- Product scope: Blender add-on thin client + Python-first local backend.
- Active profile: `blender-addon`.
- Implemented: backend CLI, DrawingIR, deterministic SVG, diagnostics, Blender
  bridge and panel, GOST composition, explicit dimensions, standards matching,
  Image Assist, fail-closed runtime validation, and two-ZIP packaging.
- Dormant profile: `windows-exe`. The current add-on/backend ZIPs do not activate
  Windows executable packaging, installers, or signing.
- Deferred: FreeCAD/TechDraw projection provider, hidden-line extraction,
  rendered preview, DXF/PDF/DWG, installers, and Windows executable packaging.

## Backend Runtime

The backend is currently a stdlib-only Python package under
`backend/src/blueprints_backend`.

Run the source checkout with a job folder. PowerShell:

```powershell
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONPATH = "backend/src"
python -m blueprints_backend <job-folder>
```

POSIX shell:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/src python -m blueprints_backend <job-folder>
```

Replace `<job-folder>` with the path to a folder containing `job.json`. The
explicit `PYTHONPATH` is required when running the source tree without
installing the backend package.

The job folder contract is:

- input: `job.json`
- outputs: `drawing_ir.json`, `sheet.svg`, `diagnostics.json`

The backend supports line entities in DrawingIR. Unsupported entity types are skipped and
reported as diagnostics warnings when a valid sheet can still be emitted.

## Blender Add-on Bridge

The Blender add-on source lives under `blender_addon/blueprints_addon`.

The add-on provides:

- `bl_info` for Blender 5.1;
- add-on preferences for backend Python, backend source, job root, export
  format, and timeout; `Backend Source` is the folder that directly contains
  the `blueprints_backend` package;
- SceneSnapshot JSON export for visible scene objects;
- OBJ or GLB scene asset export into the backend job folder;
- backend launch through `<python> -m blueprints_backend <job-folder>`;
- backend-side placeholder DrawingIR for SceneSnapshot jobs until projection is
  implemented;
- result inspection by loading `diagnostics.json` and `sheet.svg` into Blender
  Text data-blocks. `Blueprints SVG Preview` contains raw SVG source for
  inspection; it is not a rendered preview.

SceneSnapshot jobs still end with the `projection_pending` warning because CAD
projection is not implemented. The operator reports that warning and does not
claim that a blueprint was generated.

CAD projection, hidden-line extraction, rendered preview, and DXF/PDF/DWG
exports remain deferred.

## GOST Sheet Composition

The backend now supports an opt-in GOST v1 sheet composer through
`sheet.standard: "GOST"` in `job.json`.

The composer provides:

- A4 GOST frame margins;
- backend-owned title block grid and title metadata rendering;
- DrawingIR `sheet_elements` for frame, title block lines, and text;
- GOST line layers for frame, thin grid lines, text, visible geometry, and
  hidden geometry;
- deterministic golden SVG coverage for GOST output.

The Blender bridge requests GOST sheet composition in its backend job payload
but still does not synthesize projection-derived drawing entities.

## Explicit Dimensions

The backend now supports explicit basic dimension annotations on each view
through `view.dimensions[]` in `job.json`.

The dimension pipeline provides:

- DrawingIR dimension records on a dedicated `dimension` layer;
- deterministic SVG rendering for basic linear, diameter, radius, hole, and
  center-distance annotations;
- backend validation for supported dimension payloads;
- diagnostics warnings for unsupported dimension types, which are skipped while
  valid supported dimensions still render;
- golden SVG coverage for a dimensioned A4 GOST job.

It does not infer dimensions from projected geometry and does not implement
angular or ordinate dimensions, tolerances, detailed GOST dimension rules, or
derived DXF/PDF/DWG exports. Standards Matching, Image Assist, and packaging are
separate implemented subsystems.

## Standards Matching

The backend now supports a narrow, backend-owned fastener standards matcher
through `standards.fastener_matches[]` in `job.json`.

The standards matcher provides:

- a local stdlib-only starter fastener catalog for `bolt`, `nut`, and `washer`
  families;
- explicit source and license metadata for the starter catalog;
- matcher output in DrawingIR and diagnostics under `standards`;
- diagnostics warnings for unsupported fastener families and unmatched nominal
  diameters;
- backend validation for fastener match request payloads;
- backend tests covering matches, warnings, and unchanged SVG output.

The starter data is project-authored, non-normative metadata for matcher
plumbing; no third-party standards table is copied. It does not implement exact
standards geometry, automatic fastener detection, BOM generation,
FreeCAD/TechDraw execution, or derived DXF/PDF/DWG exports. Image Assist and
packaging are separate implemented subsystems.

## Image Assist

The backend now supports explicit assistive image overlays through
`image_assist` in `job.json`.

Image Assist provides:

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

Image Assist is stdlib-only and does not add computer-vision dependencies, image
classification, automatic scale calibration, FreeCAD/TechDraw execution, or
derived DXF/PDF/DWG exports. Packaging is a separate implemented subsystem.

## Two-ZIP Packaging

The repository now has stdlib-only release packaging for the active Blender
add-on + backend scope.

The packaging pipeline provides:

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

Create local release artifacts from the clean current Git `HEAD` snapshot when
needed. The optional commit argument is an assertion that must resolve to that
same full `HEAD` commit:

```bash
python -B scripts/package_release.py --output-dir <dir> [--commit <expected-head>]
```

The release packager reads versions and payload bytes from the verified commit,
rejects relevant staged, unstaged, or untracked changes, and fails before
creating the output directory when Git identity or provenance cannot be
verified. Generated release folders and zips must not be committed. This
packaging does not add installers, code signing, Windows executable packaging,
FreeCAD/TechDraw execution, OCCT/C++ builds, or derived DXF/PDF/DWG exports.
Creating these local artifacts does not approve a public release or publication.

## Runtime Contract Hardening

The existing add-on/backend boundary fails closed without adding CAD
projection or a new runtime stack. It hardens source-path confinement, backend
output validation, XML/SVG identifiers and text, add-on configuration errors,
warning reporting, release-package execution, and component version ownership.

### Install the two ZIPs

The add-on and backend remain separate artifacts:

1. Install and enable `blueprints_addon-<addon-version>.zip` through Blender
   Preferences.
2. Extract `blueprints_backend-<backend-version>.zip` to a stable local folder.
3. Set the add-on preference `Backend Source` to the extracted folder that
   directly contains `blueprints_backend`, not to the ZIP and not to the
   `blueprints_backend` package folder itself.

For example, after extraction this is the required layout:

```text
D:\BlueprintsBackend\
└── blueprints_backend\
    ├── __init__.py
    └── __main__.py
```

Set `Backend Source` to `D:\BlueprintsBackend`. An empty preference may discover
`backend/src` only when the add-on is running from this repository's source
checkout. An installed add-on outside a source checkout instead reports the
actionable `backend_not_configured` error; it does not search the job folder or
the current working directory.

`Backend Python` is optional; when blank, the add-on uses Blender's
`sys.executable`. `Job Root` is also optional; when blank, the add-on creates
temporary job folders.

The bridge launches the backend with the validated Backend Source as its
working directory and passes an absolute job-folder argument. The job folder is
the job exchange folder and is never used as an import or source working
directory.

Current component versions are intentionally independent: add-on `0.2.1`,
backend `0.1.1`, and Node verification harness `0.1.0`; data schemas remain
`1.0`. These versions are owned separately and are not a lockstep product
version.

SceneSnapshot projection remains pending. A successful backend process
may therefore produce `projection_pending`; Blender reports it as a warning,
does not show `Blueprint generated`, and keeps `Blueprints SVG Preview` as raw
SVG source rather than a rendered viewport preview.

## Verification

Node is used as the repository verification command harness, not as the product
runtime. Tests and ad-hoc probes run through the documented `npm run` wrappers;
the source-checkout product CLI above and the release packager are the only
documented direct-Python entrypoints.

```bash
npm run test:backend
npm run test:blender
npm run test:packaging
npm run codex:ship
```

`codex:ship` runs the Codex infrastructure gates plus the stdlib backend and
bridge unit tests plus packaging smoke through `quality:deep`. `test:blender`
is an explicit local Blender 5.1 background smoke; set `BLENDER_EXE` when
Blender 5.1 is not on the standard Windows install path. PostToolUse may call
`npm run test:blender -- --if-available` after `quality:deep`; that conditional
route defers only when Blender was not explicitly configured and cannot be
auto-discovered.

## Handoff

`docs/handoff/ITERATION_LOG.md` is a closed historical ledger through P0b and is
not a living status page. Do not backfill or append new sessions there. Current
completed or blocked session handoffs are mandatory in the canonical Second
Brain project `Sessions` directory.
