# Verification

This repository verifies Codex infrastructure plus the active backend and
Blender bridge test slices.

## Commands

```bash
npm run codex:verify-plugin
npm run check:governance
npm run check:js
npm run test:backend
npm run test:blender
npm run test:packaging
npm run verify
npm run quality:fast
npm run quality:deep
npm run codex:ship
```

Success means the relevant command exits with `0 FAIL`.

## Scope

The gate checks:

- plugin manifest and marketplace wiring;
- skill frontmatter and `agents/openai.yaml` files;
- `.codex` agents, hooks, and Windows command entries;
- active Blender add-on profile docs and dormant Windows executable profile docs;
- governance against stale source-repo rules and old pass totals;
- CI presence and command order;
- iteration handoff log presence.
- backend CLI, DrawingIR, SVG, and diagnostics behavior covered by Python
  stdlib `unittest` tests.
- GOST v1 sheet composition covered by backend golden SVG tests.
- Dimensions v1 explicit annotation behavior covered by backend golden SVG and
  unsupported-dimension diagnostics tests.
- Standards DB v1 fastener matching covered by backend fixture tests for
  source/license metadata, unsupported-family warnings, unmatched-diameter
  warnings, and unchanged SVG output.
- Image Assist v1 covered by backend fixture tests for relative overlay SVG
  output, diagnostics output registration, unsupported overlay warnings, and
  rejection of absolute overlay coordinates without explicit scale.
- I7 packaging and hardening covered by backend crash-log diagnostics tests,
  packaging manifest tests, and `npm run test:packaging` temporary artifact
  smoke.
- I8 backend negative contracts in `backend/tests/test_job_contracts.py` cover
  normalized POSIX-relative source paths; POSIX/Windows rooted, drive-relative,
  UNC, traversal, backslash-relative, and non-normalized rejection; missing,
  directory, empty, symlink, and resolved-escape sources; SceneSnapshot
  UTF-8/JSON/object/schema validation; entity-ID and layer rules; and XML
  1.0-invalid text rejection.
- I8 SVG-ID cases in `backend/tests/test_svg_ids.py` cover injective namespaces
  across views/entities/dimensions/sheet elements, Image Assist part-collision
  resistance, logical-ID trace attributes, deterministic output, invalid XML
  text rejection, and preservation of legacy non-ID SVG structure.
- I8 bridge and operator unit cases cover explicit Backend Source package
  entrypoints, installed add-on blank-configuration failure, trusted backend
  cwd plus an absolute job argument, malformed/empty/partial backend outputs,
  warning-only operator completion, `projection_pending` without false success,
  and stale Text data-block invalidation.
- I8 packaging smoke extracts the backend ZIP outside the checkout, clears
  inherited `PYTHONPATH`, runs `python -m blueprints_backend` from the extracted
  backend root, and validates its three declared outputs.
- Blender bridge smoke behavior through `npm run test:blender` when Blender 5.1
  is available locally or `BLENDER_EXE` points to Blender 5.1.
- The I8 Blender 5.1 smoke includes both source and installed-package cases. Its
  blank-configuration case enables the real installed add-on with default
  preferences and requires `backend_not_configured`, `CANCELLED`, and zero
  job/export side effects. Its configured case extracts the backend ZIP, sets
  Backend Source to the folder containing `blueprints_backend`, runs the real
  operator to completion, and requires diagnostics plus raw SVG source in the
  compatible `Blueprints SVG Preview` Text block. The expected
  `projection_pending` result is a warning and never `Blueprint generated`.

`codex:ship` remains CI-safe and does not load Blender. The explicit
`test:blender` command loads Blender 5.1 in background mode for bridge
changes. `test:packaging` packages the add-on and backend only inside a
temporary directory and does not commit generated artifacts. The gates do not
run a browser, compile an executable, build installers, invoke
FreeCAD/TechDraw, or generate committed product artifacts.
