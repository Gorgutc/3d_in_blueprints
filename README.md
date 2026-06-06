# 3d_in_blueprints

Blender add-on + local standalone backend for generating blueprint-style
technical drawings from 3D scene data.

## Current State

- Product scope: Blender add-on thin client + Python-first local backend.
- Active profile: `blender-addon`.
- Dormant profile: `windows-exe`, until packaging work explicitly activates it.
- Implemented slices: I1 backend CLI + DrawingIR + deterministic SVG +
  diagnostics; I2 Blender Bridge thin-client smoke.
- Not implemented yet: FreeCAD/TechDraw execution, GOST composer, dimensions,
  standards DB, image assist, packaging, DXF/PDF, DWG.

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

## Verification

Node is used as the repository verification command harness, not as the product
runtime.

```bash
npm run test:backend
npm run test:blender
npm run codex:ship
```

`codex:ship` runs the Codex infrastructure gates plus the stdlib backend and
bridge unit tests through `quality:deep`. `test:blender` is an explicit local
Blender 5.1 background smoke; set `BLENDER_EXE` when Blender 5.1 is not on the
standard Windows install path.

## Handoff

Iteration state is recorded in `docs/handoff/ITERATION_LOG.md`. Update it after
each completed, failed, or blocked iteration before continuing in a new session.
