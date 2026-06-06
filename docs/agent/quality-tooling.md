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
  backend stdlib `unittest` discovery.
- `scripts/verify-codex-infra.mjs`: validates required docs, hooks, agents,
  CI, and authority contracts.
- `lefthook.yml`: optional local pre-commit and pre-push quality gates.
- `npm run hooks:install`: installs owned native Git hooks for the same gates
  and refuses to overwrite unmanaged local hooks.
- `.codex/hooks/post-tool-verify.js`: runs `quality:deep` after relevant
  infrastructure or backend edits.
- `.github/workflows/codex-infra.yml`: CI gate for npm install and ship checks.

## Command Groups

- `quality:fast`: plugin, governance, JS syntax, and infra verification.
- `test:backend`: backend Python stdlib tests for the active I1 product slice.
- `quality:deep`: `quality:fast` plus backend product tests.
- `codex:ship`: required final local gate before commit, push, PR, or delivery.
