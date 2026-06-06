# ADR 0003: Blender Add-on + Backend Activation

## Status

Accepted.

## Context

The current task selected the product direction from the prepared requirements:
Blender add-on as the user-facing client plus a local standalone backend as the
CAD drawing engine.

## Decision

Activate the `blender-addon` profile for planning and future product iterations.
Keep `windows-exe` dormant until a future Windows executable packaging request
explicitly activates it.

The selected architecture is:

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

## Consequences

- P0 and I0 may update infrastructure, governance, profile docs, and handoff
  docs without adding product runtime dependencies.
- I1 owns the first product code slice: backend CLI, job schema, DrawingIR,
  deterministic SVG, diagnostics, and golden fixture.
- I2 owns Blender add-on bridge code and headless Blender smoke.
- Later iterations add GOST composition, dimensions, standards matching, image
  assist, and packaging.
- Product source, Blender commands, installers, browser gates, generated
  artifacts, and runtime dependencies remain blocked unless the active
  iteration explicitly requires them and updates verification.
