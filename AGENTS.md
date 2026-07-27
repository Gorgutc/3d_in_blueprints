# AGENTS.md - 3d_in_blueprints Codex Source Of Truth

Read this file before changing this repository. It is the canonical instruction
file for Codex and other coding agents.

## Current State

- Product scope is selected: Blender add-on + local standalone backend.
- The Blender add-on, preferences, operator, panel, backend bridge, backend
  composition pipeline, diagnostics, raw SVG Text inspection, and separate
  add-on/backend ZIP packaging are implemented.
- The Blender add-on is a thin client. The standalone backend is the source of
  truth for sheet composition, dimensions, diagnostics, and exports. Projection
  and hidden-line extraction remain behind the deferred provider boundary.
- The Node package in this repo is a verification command harness, not the
  product runtime.
- The `blender-addon` profile is active for the implemented product and future
  approved capability iterations. The `windows-exe` profile remains dormant;
  two-ZIP product packaging does not activate an EXE, installer, or signing
  toolchain.
- Do not create product source code, runtime dependencies, installers, browser
  gates, Blender packages, or generated artifacts outside the current accepted
  iteration scope.

## Authority Order

current user request > AGENTS.md > scripts/verify-codex-infra.mjs and
scripts/check-governance.mjs > repo-local skills > current `docs/agent`,
`docs/release`, and root project references.

Do not promote source-repository rules, legacy Claude workflow, framework
choices, UI kits, static-site assumptions, or old pass totals into active policy
unless they are rewritten here for this repository and verified.

Active instructions are `AGENTS.md`, `.codex/**`, `.agents/**`, repo-local
skills, root compatibility/project docs, `docs/release/**`, package scripts,
hooks, CI, and every current `docs/agent/**` surface except ADRs and migration
inventory. ADRs and migration inventory are reference records.
`docs/handoff/**` and the marked I1-I8 profile contracts are append-only
historical evidence, not current policy.

## Required Skills

Repo-local skills live in `plugins/blueprints-codex/skills/` and are exposed by
`.agents/plugins/marketplace.json`.

Use the relevant skill before substantial work:

- `$blueprints-session-bootstrap` for session startup.
- `$blueprints-rules` before any repo change.
- `$blueprints-audit-orchestrator` for broad audits or instruction changes.
- `$blueprints-context-keeper` for narrow read-only context gathering.
- `$blueprints-spec-guardian` and `$blueprints-frozen-decisions` for policy or
  architecture-sensitive changes.
- `$blueprints-quality-gate`, `$blueprints-quality-tooling`, and
  `$blueprints-instruction-drift` before delivery.
- `$blueprints-blender-addon-profile` for Blender add-on, backend bridge,
  background Blender test, or add-on packaging work.
- `$blueprints-windows-exe-profile` only when the current request explicitly
  discusses Windows executable packaging.

## Agent Orchestration

Use explicit spawned subagents when available. Inline summaries are not a
substitute for delegated evidence.

For broad work, spawn the applicable read-only roles in `.codex/agents/`:

- code, deadwood, reuse, runtime, visual, frozen-decision, instruction-drift,
  stack, quality-tooling, Codex-infra, packaging, Blender, and verification
  reviewers.

Every delegated prompt must state the goal, selected skills, selected agents,
write zone, verification, stop rules, and expected output. Every result must
include PASS/FAIL, evidence, findings, blockers, and explicit defers.

If spawned agents are unavailable, run the same roles locally and label it as a
fallback.

## Commands

Use these infrastructure commands:

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

`npm run codex:ship` is mandatory before commit, push, PR, or final delivery of
agent-infrastructure or product changes. `npm run test:blender` is the strict
Blender 5.1 gate for Blender-sensitive delivery. PostToolUse may call
`npm run test:blender -- --if-available` only after `quality:deep`; it may defer
only when Blender was not explicitly configured and no Blender 5.1 executable
is discoverable.
`npm run test:packaging` is required for release packaging changes and is part
of `quality:deep`.

## Done When

- Required checks pass with `0 FAIL`.
- All required subagent roles report PASS, or the fallback review is explicitly
  reported.
- `/review` is run before final delivery when available. If `/review` is not
  available, perform the equivalent requirements and diff review and label it as
  the fallback.
- Visual evidence is required only when Blender UI, rendered SVG/overlay output,
  or visual assets change. Raw SVG in a Text block is not rendered-preview
  evidence.
- No compiler, installer, Blender package, browser test stack, runtime
  dependency, or generated product artifact is introduced unless the current
  iteration explicitly requires it and matching verification is updated.

## GitHub

Use the GitHub plugin for repository or PR context when publishing, reviewing
GitHub state, or checking remote metadata. Local git commands are acceptable for
branch, diff, status, commit, and push operations.
