# Iteration Log

This file is the session handoff ledger. Update it after every completed or
blocked iteration so a later session can resume without reconstructing context.

## Schema

```yaml
iteration_id:
status: PASS | FAIL | BLOCKED
date:
scope_completed:
files_changed:
commands_run:
  - command:
    result:
    evidence:
artifacts_generated:
acceptance_gates:
  passed:
  failed:
accepted_deviations:
explicit_defers:
blockers:
risks_or_regressions:
repo_state:
next_iteration_ready: true | false
resume_prompt:
```

## Entries

```yaml
iteration_id: P0-infrastructure-unblock
status: PASS
date: 2026-06-01
scope_completed:
  - Fixed CRLF-aware SKILL.md frontmatter parsing in the plugin verifier.
  - Added governance coverage for the repo-local plugin marketplace.
  - Aligned the prompt nudge with the required /review or fallback closeout.
  - Made verification_reviewer read-only like the other broad-audit roles.
files_changed:
  - scripts/verify-codex-plugin.mjs
  - scripts/check-governance.mjs
  - .codex/hooks/user-prompt-nudge.js
  - .codex/agents/verification_reviewer.toml
commands_run:
  - command: npm.cmd run codex:verify-plugin
    result: PASS
    evidence: CRLF-frontmatter parsing accepted repo-local skills.
artifacts_generated: []
acceptance_gates:
  passed:
    - codex:verify-plugin regression gate
  failed: []
accepted_deviations: []
explicit_defers:
  - No product runtime, Blender command, installer, browser gate, or generated artifact added in P0.
blockers: []
risks_or_regressions: []
repo_state: working branch codex/blueprints-product-activation
next_iteration_ready: true
resume_prompt: Continue with I0 activation verification and keep windows-exe dormant.
```

```yaml
iteration_id: I0-product-scope-activation
status: PASS
date: 2026-06-01
scope_completed:
  - Selected Blender add-on + local standalone backend as the product scope.
  - Activated blender-addon profile and kept windows-exe dormant.
  - Recorded Blender 5.1, Python-first backend, FreeCAD/TechDraw MVP provider,
    future OCCT/C++, subprocess/job folder transport, SVG canonical output,
    derived DXF/PDF, DWG deferral, and GPL boundary posture.
  - Added ADR 0003 for the activation decision.
  - Added this handoff ledger for continuation across sessions.
files_changed:
  - AGENTS.md
  - README.md
  - .codex/config.toml
  - .codex/hooks/session-start.js
  - .codex/hooks/user-prompt-nudge.js
  - .codex/agents/*.toml
  - docs/agent/bootstrap.md
  - docs/agent/code_review.md
  - docs/agent/frozen-decisions.md
  - docs/agent/profiles/blender-addon.md
  - docs/agent/verification.md
  - docs/agent/adrs/0001-codex-infrastructure.md
  - docs/agent/adrs/0002-dormant-product-profiles.md
  - docs/agent/adrs/0003-blender-addon-backend-activation.md
  - docs/agent/evals/README.md
  - docs/handoff/ITERATION_LOG.md
  - plugins/blueprints-codex/skills/*/SKILL.md
  - plugins/blueprints-codex/skills/*/agents/openai.yaml
  - scripts/check-governance.mjs
  - scripts/verify-codex-infra.mjs
  - package.json
commands_run:
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Full infrastructure ship gate passed after ADR 0003 and handoff were added.
artifacts_generated:
  - docs/agent/adrs/0003-blender-addon-backend-activation.md
  - docs/handoff/ITERATION_LOG.md
acceptance_gates:
  passed:
    - codex:verify-plugin
    - check:governance
    - check:js
    - verify
    - codex:ship
  failed: []
accepted_deviations: []
explicit_defers:
  - I1 backend CLI and product code.
  - I2 Blender add-on bridge code and headless Blender smoke.
  - I3-I7 product features, packaging, CI matrix, and release artifacts.
blockers: []
risks_or_regressions:
  - An existing background blender.exe 5.1 process was observed during planning; identify owner before I2 tests.
repo_state: working branch codex/blueprints-product-activation
next_iteration_ready: true
resume_prompt: Start I1 Backend CLI + DrawingIR from the active Blender add-on + backend scope; keep handoff updated after the iteration.
```
