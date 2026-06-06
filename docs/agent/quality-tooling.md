# Quality Tooling

The quality layer is intentionally local and product-runtime-neutral until a
specific iteration adds verified product checks.

## Tool Map

- `scripts/verify-codex-plugin.mjs`: validates marketplace, plugin manifest,
  skills, frontmatter, and agent metadata.
- `scripts/check-governance.mjs`: blocks stale active instructions and profile
  drift.
- `scripts/check-js-syntax.mjs`: runs `node --check` on hook and script files.
- `scripts/run-python-tests.mjs`: resolves a local Python interpreter and runs
  stdlib `unittest` discovery for backend, GOST composer, Dimensions v1,
  Standards DB v1, Image Assist v1, release packaging behavior, and bridge
  unit tests.
- `scripts/run-blender-smoke.mjs`: resolves Blender 5.1 and runs the I2 bridge
  smoke test, including backend sheet composition, in background mode when
  invoked explicitly.
- `scripts/package_release.py`: creates version-stamped add-on and backend zip
  artifacts plus a release manifest using Python stdlib only.
- `scripts/run-packaging-smoke.mjs`: resolves Python and runs packaging into a
  temporary directory, verifying required zip contents and artifact policy.
- `scripts/verify-codex-infra.mjs`: validates required docs, hooks, agents,
  CI, and authority contracts.
- `lefthook.yml`: optional local pre-commit and pre-push quality gates.
- `npm run hooks:install`: installs owned native Git hooks for the same gates
  and refuses to overwrite unmanaged local hooks.
- `.codex/hooks/post-tool-verify.js`: runs `quality:deep` after relevant
  infrastructure or backend edits.
- `.github/workflows/codex-infra.yml`: CI gate for npm install and ship checks.

`docs/handoff/ITERATION_LOG.md` is a historical handoff ledger, not an active
policy source. It can preserve command output counts as evidence and is not part
of stale-total governance scanning.

## Command Groups

- `quality:fast`: plugin, governance, JS syntax, and infra verification.
- `test:backend`: Python stdlib tests for backend, GOST composer, Dimensions
  v1, Standards DB v1, Image Assist v1, release packaging behavior, and bridge
  unit behavior.
- `test:blender`: explicit Blender 5.1 background smoke for bridge changes.
- `test:packaging`: stdlib packaging smoke that writes generated release
  artifacts only to a temporary directory.
- `quality:deep`: `quality:fast` plus backend, bridge unit, and packaging
  smoke tests.
- `codex:ship`: required final local gate before commit, push, PR, or delivery.
