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

## Iteration Boundaries

- I1 owns backend CLI, job schema, DrawingIR, deterministic SVG, and diagnostics.
- I2 owns Blender bridge code and headless Blender smoke.
- I3-I6 add GOST composition, dimensions, standards matching, and image assist.
- I7 owns add-on zip, backend bundle, CI matrix, version stamping, crash logs,
  release docs, and packaging smoke.
