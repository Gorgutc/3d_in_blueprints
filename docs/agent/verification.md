# Verification

This repository currently verifies only Codex infrastructure.

## Commands

```bash
npm run codex:verify-plugin
npm run check:governance
npm run check:js
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

The gate does not build an app, run a browser, compile an executable, or load
Blender until a product implementation iteration explicitly adds and verifies
that behavior.
