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
- packaging and release zip format;
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

## Iteration Boundaries

- I1 owns backend CLI, job schema, DrawingIR, deterministic SVG, and diagnostics.
- I2 owns Blender bridge code and headless Blender smoke.
- I3-I6 add GOST composition, dimensions, standards matching, and image assist.
- I7 owns add-on zip, backend bundle, CI matrix, version stamping, crash logs,
  release docs, and packaging smoke.
