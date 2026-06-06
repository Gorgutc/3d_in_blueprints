# Blender Add-on Profile

Profile id: `blender-addon`.
Status: active.

This profile covers the selected product scope: Blender add-on + local
standalone backend.

## Role Split

- Blender is the user-facing client and export launcher.
- The backend is the source of truth for CAD projection, hidden-line extraction,
  sheet composition, dimensions, diagnostics, and exports.
- Product code must not be added outside the accepted iteration scope.

## Frozen Decisions

- Blender baseline: Blender 5.1.
- Backend: Python-first.
- MVP geometry provider: FreeCAD/TechDraw behind a provider boundary.
- Future geometry provider: native OCCT/C++ only after profiling justifies it.
- Add-on/backend transport: subprocess + job folder.
- Canonical output: SVG.
- Derived outputs: DXF and PDF.
- DWG: not core v1.
- GPL-sensitive dependencies: allowed only across a separate
  process/distribution boundary.

## Required Add-on Decisions

Before product add-on code lands, the implementation iteration must define:

- `bl_info` ownership and Blender 5.1 compatibility fields;
- Python package layout and add-on entrypoint;
- registration and unregistration contract;
- SceneSnapshot JSON schema and OBJ/GLB export contract;
- backend subprocess command, job folder layout, timeout, and error handling;
- SVG/diagnostics preview behavior;
- background Blender smoke command;
- packaging and release zip format activation, or an explicit deferral to the
  packaging iteration;
- add-on preferences and asset paths;
- artifact handling in `DO_NOT_PUSH.md`.

## I1 Backend Contract

I1 may add backend-only product code without adding Blender add-on code,
Blender runtime commands, packages, installers, browser gates, or generated
product artifacts.

I1 resolves this backend bridge contract:

- backend invocation: `python -m blueprints_backend <job-folder>`;
- job folder input: `job.json`;
- job folder outputs: `drawing_ir.json`, `sheet.svg`, and `diagnostics.json`;
- timeout owner: the future Blender client owns subprocess timeout enforcement;
- backend error behavior: return non-zero only for malformed input, missing
  required files, or filesystem write failure; unsupported geometry is reported
  in diagnostics warnings when a valid sheet can still be emitted;
- canonical output: deterministic SVG generated from DrawingIR;
- test command: `npm run test:backend` using Python stdlib `unittest`.

The Blender add-on entrypoint, add-on package layout, `bl_info`,
registration/unregistration contract, background Blender smoke command, and
release zip format remain I2/I7 decisions and must stay out of I1.

## I2 Blender Bridge Contract

I2 adds the thin Blender client bridge without adding packaging, FreeCAD
execution, derived exports, or CAD projection logic.

- add-on package layout: `blender_addon/blueprints_addon`;
- add-on entrypoint: `blender_addon/blueprints_addon/__init__.py`;
- `bl_info`: owned by the add-on entrypoint, with Blender baseline `(5, 1, 0)`;
- registration contract: `BLUEPRINTS_AddonPreferences`,
  `BLUEPRINTS_OT_generate`, and `BLUEPRINTS_PT_panel` are registered and
  unregistered in deterministic order;
- SceneSnapshot JSON schema: `schema_version`, scene name, unit settings, and
  visible object records with type, transforms, dimensions, location, and
  bounding boxes;
- asset export contract: the bridge writes `scene_snapshot.json` plus either
  `scene.obj` or `scene.glb` into the job folder;
- backend job input: the add-on writes SceneSnapshot and asset references only;
  backend projection remains responsible for drawing/view synthesis;
- backend subprocess command: `<backend_python> -m blueprints_backend
  <job-folder>` with `PYTHONPATH` pointing at `backend/src` in local
  development;
- timeout owner: the Blender bridge enforces `timeout_seconds` and writes a
  backend timeout diagnostic if the subprocess exceeds it;
- preview behavior: `diagnostics.json` and `sheet.svg` are loaded into Blender
  Text data-blocks named `Blueprints Diagnostics` and `Blueprints SVG Preview`;
- background smoke command: `npm run test:blender`, which locates Blender 5.1
  or uses `BLENDER_EXE`;
- add-on preferences: backend Python path, backend source path, job root,
  export format, and timeout seconds;
- packaging remains I7 and no release zip format is activated in I2;
- artifact handling: smoke output is written to temporary job folders and must
  not be committed.

## I3 GOST Composer Contract

I3 adds backend-owned GOST v1 sheet composition without adding FreeCAD/TechDraw
execution, CAD projection, dimensions, derived exports, or packaging.

- activation: `job.json` requests GOST through `sheet.standard: "GOST"`;
- supported sheet: A4 portrait only for v1;
- DrawingIR: backend adds `sheet.standard`, `sheet.frame_mm`,
  `sheet.title_block_mm`, `sheet.drawing_area_mm`, and `sheet_elements`;
- GOST sheet elements: frame rectangle, title block rectangle, title block grid
  lines, and text labels;
- line layers: `frame`, `thin`, `text`, `visible`, and `hidden`;
- Blender bridge behavior: the add-on may request GOST sheet metadata but must
  not synthesize GOST geometry or drawing entities;
- verification: backend stdlib tests include a GOST job fixture and golden SVG;
- explicit defers: view projection rules beyond preserving view origin/scale,
  dimensions, standards DB, image assist, DXF/PDF/DWG, and packaging remain
  future iterations.

## I4 Dimensions Contract

I4 adds backend-owned explicit basic dimension annotations without adding CAD
projection, automatic dimension inference, standards matching, image assist,
derived exports, or packaging.

- activation: each view may provide `dimensions: []` in `job.json`;
- supported dimension types: `linear`, `diameter`, `radius`, `hole`, and
  `center_distance`;
- DrawingIR: backend adds validated dimension records to each view on the
  dedicated `dimension` layer;
- SVG: backend renders deterministic dimension extension lines, leaders,
  center marks, and text from DrawingIR;
- diagnostics: unsupported dimension types are skipped and reported through
  `unsupported_dimension` warnings while supported dimensions continue to
  render;
- validation: supported dimension payloads require finite point arrays and
  positive diameter values where applicable;
- verification: backend stdlib tests include a dimensioned A4 GOST job fixture
  and golden SVG;
- explicit defers: automatic projection-derived dimensions, angular
  dimensions, ordinate dimensions, tolerances, detailed GOST dimension rules,
  standards DB, image assist, DXF/PDF/DWG, and packaging remain future
  iterations.

## I5 Standards DB Contract

I5 adds backend-owned standards matching without adding CAD projection,
automatic fastener detection, image assist, exact standards geometry, derived
exports, or packaging.

- activation: `job.json` may provide `standards.fastener_matches[]`;
- starter catalog: local stdlib-only project-authored metadata for `bolt`,
  `nut`, and `washer` families;
- source control: every catalog entry points to source metadata with explicit
  license and non-normative authority fields;
- matcher: requests match by fastener `family` and `nominal_diameter_mm`, then
  reference a `view_id` and `dimension_id` for traceability;
- DrawingIR and diagnostics: backend emits matched entries and source metadata
  under `standards`;
- diagnostics: unsupported families and unmatched nominal diameters are skipped
  with warnings while valid matches continue;
- validation: fastener match requests require ids, view/dimension references,
  family names, and positive finite nominal diameters;
- SVG: I5 does not add new standards drawing layout; SVG remains generated from
  existing DrawingIR sheet, entity, and dimension records;
- verification: backend stdlib tests include a standards job fixture and
  warning coverage;
- explicit defers: normative standards tables, exact fastener geometry,
  automatic fastener detection, BOM generation, image assist, DXF/PDF/DWG, and
  packaging remain future iterations.

## I6 Image Assist Contract

I6 adds backend-owned assistive image overlays without adding automatic
computer-vision measurement, CAD projection, derived exports, or packaging.

- activation: `job.json` may provide `image_assist` with `mode: "assistive"`;
- scope: assist overlays are hints only and must not be promoted to exact
  engineering geometry without later projection/scale work;
- supported overlay types: `contour`, `primitive_hint`, and
  `relative_dimension`;
- supported primitive hints: circle candidates through relative center and
  radius fields;
- units: I6 DrawingIR image assist records use `units: "relative"`;
- SVG: backend writes deterministic `assist_overlay.svg` and lists it in
  diagnostics as `image_assist_overlay`;
- Blender bridge behavior: the add-on does not synthesize, interpret, or
  visually merge assist geometry in I6; future preview work may load the extra
  backend output generically and must run `npm run test:blender`;
- artifact handling: generated `assist_overlay.svg` job outputs must not be
  committed outside explicit golden fixtures;
- validation: absolute `*_mm` overlay coordinates require an explicit
  `scale.reference_mm_per_unit`; without that scale the backend returns an
  `invalid_image_assist` diagnostics error;
- diagnostics: unsupported overlay or primitive types are skipped and reported
  with warnings while valid assist overlays continue to render;
- dependencies: I6 remains stdlib-only and must not add PIL, OpenCV, NumPy,
  scikit-image, FreeCAD/TechDraw, OCCT, or subprocess-driven image/CAD
  runtimes;
- explicit defers: automatic scale calibration, absolute dimensions from
  images, image classification, edge detection, template matching, CAD
  projection, DXF/PDF/DWG, and packaging remain future iterations.

## I7 Packaging + Hardening Contract

I7 activates release packaging for the selected Blender add-on + backend scope
without activating the dormant Windows executable profile.

- add-on artifact: version-stamped zip of `blender_addon/blueprints_addon`
  using the Blender add-on `bl_info["version"]`;
- backend artifact: version-stamped zip of `backend/src/blueprints_backend`
  using `blueprints_backend.__version__`;
- release manifest: `release_manifest.json` records schema version, package
  version, commit stamp, artifact ids, source folders, and artifact versions;
- packaging smoke: `npm run test:packaging` writes artifacts only into a
  temporary directory and verifies required zip contents;
- CI: the Codex infrastructure workflow runs `npm run codex:ship` on Windows
  and Linux;
- crash logs: unexpected backend exceptions write `crash.log` and an error
  diagnostics payload that references that log;
- artifact policy: generated zips, release folders, and backend job outputs
  remain uncommitted except for explicit test fixtures.

I7 does not add installers, code signing, Windows executable packaging,
FreeCAD/TechDraw execution, OCCT/C++ builds, DXF/PDF/DWG exports, or committed
release artifacts.

## Iteration Boundaries

- I1 owns backend CLI, job schema, DrawingIR, deterministic SVG, and diagnostics.
- I2 owns Blender bridge code and headless Blender smoke.
- I3 owns GOST v1 sheet composition.
- I4 owns basic explicit dimensions.
- I5 owns standards DB and fastener matching.
- I6 owns assistive relative image overlays.
- I7 owns add-on zip, backend bundle, CI matrix, version stamping, crash logs,
  release docs, and packaging smoke.
