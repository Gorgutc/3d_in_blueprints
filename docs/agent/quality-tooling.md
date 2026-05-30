# Quality Tooling

The quality layer is intentionally local and stack-neutral.

## Tool Map

- `scripts/verify-codex-plugin.mjs`: validates marketplace, plugin manifest,
  skills, frontmatter, and agent metadata.
- `scripts/check-governance.mjs`: blocks stale active instructions and profile
  drift.
- `scripts/check-js-syntax.mjs`: runs `node --check` on hook and script files.
- `scripts/verify-codex-infra.mjs`: validates required docs, hooks, agents,
  CI, and authority contracts.
- `lefthook.yml`: optional local pre-commit and pre-push quality gates.
- `npm run hooks:install`: installs owned native Git hooks for the same gates
  and refuses to overwrite unmanaged local hooks.
- `.github/workflows/codex-infra.yml`: CI gate for npm install and ship checks.

## Command Groups

- `quality:fast`: plugin, governance, JS syntax, and infra verification.
- `quality:deep`: currently the same as fast; future stack checks can extend it.
- `codex:ship`: required final local gate before commit, push, PR, or delivery.
