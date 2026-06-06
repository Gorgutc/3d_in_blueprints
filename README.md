# 3d_in_blueprints

Blender add-on + local standalone backend for generating blueprint-style
technical drawings from 3D scene data.

## Current State

- Product scope: Blender add-on thin client + Python-first local backend.
- Active profile: `blender-addon`.
- Dormant profile: `windows-exe`, until packaging work explicitly activates it.
- Implemented slice: I1 backend CLI + DrawingIR + deterministic SVG +
  diagnostics.
- Not implemented yet: Blender add-on bridge, FreeCAD/TechDraw execution,
  GOST composer, dimensions, standards DB, image assist, packaging, DXF/PDF,
  DWG.

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

## Verification

Node is used as the repository verification command harness, not as the product
runtime.

```bash
npm run test:backend
npm run codex:ship
```

`codex:ship` runs the Codex infrastructure gates and the backend stdlib
`unittest` suite through `quality:deep`.

## Handoff

Iteration state is recorded in `docs/handoff/ITERATION_LOG.md`. Update it after
each completed, failed, or blocked iteration before continuing in a new session.
