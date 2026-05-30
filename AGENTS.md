# AGENTS.md - 3d_in_blueprints Codex Source Of Truth

Read this file before changing this repository. It is the canonical instruction
file for Codex and other coding agents.

## Current State

- No application stack is selected yet.
- Do not create app source code until the next task brief selects the product
  direction and stack.
- The Node package in this repo exists only to verify Codex infrastructure.
- Dormant profiles exist for `windows-exe` and `blender-addon`; neither profile
  is active until a future user request explicitly activates it.

## Authority Order

current user request > AGENTS.md > scripts/verify-codex-infra.mjs and
scripts/check-governance.mjs > repo-local skills > docs/profile references.

Do not promote source-repository rules, legacy Claude workflow, framework
choices, UI kits, static-site assumptions, or old pass totals into active policy
unless they are rewritten here for this repository and verified.

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
- `$blueprints-windows-exe-profile` or `$blueprints-blender-addon-profile` only
  when the current request explicitly discusses those profiles.

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
npm run verify
npm run quality:fast
npm run quality:deep
npm run codex:ship
```

`npm run codex:ship` is mandatory before commit, push, PR, or final delivery of
agent-infrastructure changes.

## Done When

- Required checks pass with `0 FAIL`.
- All required subagent roles report PASS, or the fallback review is explicitly
  reported.
- `/review` is run before final delivery when available. If `/review` is not
  available, perform the equivalent requirements and diff review and label it as
  the fallback.
- No app stack, compiler, installer, Blender package, browser test stack, or
  runtime dependency is introduced unless the user explicitly selected it.

## GitHub

Use the GitHub plugin for repository or PR context when publishing, reviewing
GitHub state, or checking remote metadata. Local git commands are acceptable for
branch, diff, status, commit, and push operations.
