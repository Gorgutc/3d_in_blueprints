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
- Blender bridge smoke behavior through `npm run test:blender` when Blender 5.1
  is available locally or `BLENDER_EXE` points to Blender 5.1.

`codex:ship` remains CI-safe and does not load Blender. The explicit
`test:blender` command loads Blender 5.1 in background mode for I2 bridge
changes. The gates do not run a browser, compile an executable, package an
add-on, build installers, invoke FreeCAD/TechDraw, or generate committed
product artifacts until a product implementation iteration explicitly adds and
verifies that behavior.
