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
- Blender bridge smoke behavior through `npm run test:blender` when Blender 5.1
  is available locally or `BLENDER_EXE` points to Blender 5.1.

`codex:ship` remains CI-safe and does not load Blender. The explicit
`test:blender` command loads Blender 5.1 in background mode for bridge
changes. `test:packaging` packages the add-on and backend only inside a
temporary directory and does not commit generated artifacts. The gates do not
run a browser, compile an executable, build installers, invoke
FreeCAD/TechDraw, or generate committed product artifacts.
