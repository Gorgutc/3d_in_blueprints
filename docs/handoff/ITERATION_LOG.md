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

```yaml
iteration_id: I1-backend-cli-drawingir
status: PASS
date: 2026-06-01
scope_completed:
  - Added a Python-first backend CLI package for the accepted I1 scope.
  - Defined the job-folder contract: input `job.json`; outputs
    `drawing_ir.json`, `sheet.svg`, and `diagnostics.json`.
  - Added DrawingIR v1 generation for line entities and deterministic SVG
    rendering from DrawingIR.
  - Added diagnostics behavior for success, missing job input, and unsupported
    geometry warnings.
  - Hardened job validation so malformed top-level JSON shapes and non-finite
    numbers return diagnostics instead of crashing or emitting invalid outputs.
  - Added stdlib `unittest` coverage with a golden SVG fixture and no runtime
    dependencies.
  - Wired backend tests into `quality:deep` and `codex:ship` through a
    cross-platform Node Python runner.
  - Updated CI, verification docs, profile contract, plugin wording, hooks, and
    governance/verification scripts to match I1.
  - Updated README to describe the implemented I1 backend contract and current
    deferred product scope.
files_changed:
  - backend/src/blueprints_backend/__init__.py
  - backend/src/blueprints_backend/__main__.py
  - backend/src/blueprints_backend/cli.py
  - backend/src/blueprints_backend/diagnostics.py
  - backend/src/blueprints_backend/drawing_ir.py
  - backend/src/blueprints_backend/job.py
  - backend/src/blueprints_backend/svg_writer.py
  - backend/tests/test_cli.py
  - backend/tests/fixtures/minimal_job.json
  - backend/tests/fixtures/golden_minimal.svg
  - scripts/run-python-tests.mjs
  - .gitignore
  - scripts/check-governance.mjs
  - scripts/check-js-syntax.mjs
  - scripts/verify-codex-infra.mjs
  - package.json
  - .github/workflows/codex-infra.yml
  - .codex/hooks.json
  - .codex/hooks/post-tool-verify.js
  - .codex/agents/blender_addon_guardian.toml
  - .codex/config.toml
  - AGENTS.md
  - README.md
  - docs/agent/frozen-decisions.md
  - docs/agent/profiles/blender-addon.md
  - docs/agent/quality-tooling.md
  - docs/agent/verification.md
  - docs/handoff/ITERATION_LOG.md
  - plugins/blueprints-codex/.codex-plugin/plugin.json
  - plugins/blueprints-codex/skills/blueprints-code-rules/SKILL.md
  - plugins/blueprints-codex/skills/blueprints-quality-tooling/SKILL.md
commands_run:
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED phase failed because `blueprints_backend` did not exist yet.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: 3 unittest tests passed after CLI, DrawingIR, SVG, and diagnostics implementation.
  - command: npm.cmd run check:governance
    result: PASS
    evidence: Governance scan passed after deterministic traversal and I1 wording updates.
  - command: npm.cmd run check:js
    result: PASS
    evidence: 9/9 JavaScript syntax checks passed.
  - command: npm.cmd run verify
    result: PASS
    evidence: 199/199 infrastructure contract checks passed.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Full ship gate passed with backend tests included in `quality:deep`.
  - command: deadwood final audit
    result: FAIL
    evidence: Python `__pycache__` artifacts were generated before `.gitignore` and `PYTHONDONTWRITEBYTECODE` were added; cleanup was required before final delivery.
  - command: cache cleanup
    result: PASS
    evidence: Added `.gitignore`, set `PYTHONDONTWRITEBYTECODE=1`, removed backend `__pycache__`, and confirmed `npm.cmd run test:backend` does not recreate cache artifacts.
  - command: code quality final audit
    result: FAIL
    evidence: Found missing diagnostics for top-level JSON arrays, non-finite JSON numbers, and partial PostToolUse backend verification.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: 5 unittest tests passed after adding malformed JSON shape and non-finite number regressions.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Final ship gate passed with plugin 214/214, governance 741/741, JS syntax 9/9, infra verify 203/203, and backend 5 tests OK.
artifacts_generated:
  - backend/tests/fixtures/golden_minimal.svg
acceptance_gates:
  passed:
    - backend CLI accepts a job folder and emits `drawing_ir.json`, `sheet.svg`, and `diagnostics.json`.
    - deterministic SVG output matches the committed golden fixture.
    - missing `job.json` returns non-zero with diagnostics.
    - unsupported geometry returns warnings and is skipped from DrawingIR.
    - top-level non-object `job.json` returns diagnostics instead of crashing.
    - `NaN` and other non-finite JSON constants are rejected before output generation.
    - backend tests are included in `quality:deep` and `codex:ship`.
    - PostToolUse verification runs `quality:deep` for relevant backend and
      infrastructure edits.
    - no Blender runtime command, add-on package, installer, browser gate,
      FreeCAD/TechDraw invocation, compiler, or runtime dependency was added.
  failed: []
accepted_deviations:
  - Explicit spawned agents hit thread limits and earlier preflight failures;
    final closeout uses spawned agents where available plus documented fallback
    review for unavailable roles.
explicit_defers:
  - I2 Blender add-on bridge, `bl_info`, registration contract,
    SceneSnapshot/OBJ/GLB export, subprocess timeout owner implementation, and
    headless Blender smoke.
  - I3 GOST sheet composition beyond the minimal I1 SVG sheet.
  - I4 dimensions, I5 standards DB, I6 image assist, and I7 packaging.
  - FreeCAD/TechDraw provider execution and any GPL-sensitive runtime boundary
    packaging.
  - DXF/PDF derived exports and DWG.
blockers: []
risks_or_regressions:
  - Local PATH still lacks `python`/`py`; `scripts/run-python-tests.mjs` uses
    `PYTHON`, `python3`, `python`, `py -3`, then bundled Codex Python.
  - An existing background blender.exe 5.1 process was observed during planning;
    identify owner before I2 tests.
repo_state: working branch codex/i1-backend-cli-drawingir
next_iteration_ready: true
resume_prompt: Start I2 Blender Bridge from branch `codex/i1-backend-cli-drawingir` after merging I1; keep backend CLI contract `python -m blueprints_backend <job-folder>` and preserve `drawing_ir.json`, `sheet.svg`, and `diagnostics.json` output names.
```

```yaml
iteration_id: I1-post-break-recovery
status: PASS
date: 2026-06-06
scope_completed:
  - Audited the interrupted I1 workspace against the accepted roadmap and
    Blender add-on + backend scope.
  - Confirmed README and profile docs describe the implemented I1 backend
    contract and explicitly defer I2-I7 product scope.
  - Found regenerated backend Python `__pycache__` directories after the
    connection break and removed them from the workspace.
  - Confirmed the backend test runner does not recreate `__pycache__` when run
    through `npm.cmd run test:backend`.
  - Recorded the true continuation point: I1 implementation is local on
    `codex/i1-backend-cli-drawingir` and still needs commit, push, and PR.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git status --short --branch --untracked-files=all
    result: PASS
    evidence: Workspace is on `codex/i1-backend-cli-drawingir` with I1 tracked
      modifications and new backend/test files not yet staged.
  - command: Get-ChildItem -Path backend -Recurse -Force -Directory -Filter __pycache__
    result: FAIL
    evidence: Found backend `src` and `tests` `__pycache__` directories after
      the interrupted session.
  - command: backend __pycache__ cleanup
    result: PASS
    evidence: Removed only resolved `__pycache__` directories under the repo
      backend path.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: 5 stdlib unittest tests passed.
  - command: Get-ChildItem -Path backend -Recurse -Force -Directory -Filter __pycache__
    result: PASS
    evidence: No backend `__pycache__` directories remained after the test run.
artifacts_generated: []
acceptance_gates:
  passed:
    - I1 remains scoped to backend CLI, DrawingIR, deterministic SVG, and
      diagnostics.
    - README is aligned with current development and lists I2-I7 as not yet
      implemented.
    - Generated Python cache artifacts are absent from the workspace.
  failed: []
accepted_deviations:
  - This recovery entry does not start I2; it only records the interrupted I1
    stop point and cleanup evidence.
explicit_defers:
  - Commit, push, and PR creation for I1.
  - I2 Blender Bridge after I1 is reviewed and merged.
  - Background Blender 5.1 process ownership check before I2 smoke tests.
blockers: []
risks_or_regressions:
  - Direct Python probes outside `scripts/run-python-tests.mjs` can recreate
    ignored `__pycache__`; check and clean before staging or publishing.
  - Local PATH still lacks `python`/`py`; the Node runner falls back through the
    configured Python discovery order.
repo_state: dirty working branch codex/i1-backend-cli-drawingir; I1 is not
  staged, committed, pushed, or opened as a PR.
next_iteration_ready: false
resume_prompt: First publish I1 from `codex/i1-backend-cli-drawingir`: run a fresh `npm.cmd run codex:ship`, perform `/review` or documented fallback review, stage, commit, push, and open the I1 PR. After that PR is merged, start I2 Blender Bridge.
```

```yaml
iteration_id: I1-pr-publication
status: PASS
date: 2026-06-06
scope_completed:
  - Published I1 Backend CLI + DrawingIR as a draft pull request.
  - Confirmed the published branch is `codex/i1-backend-cli-drawingir`.
  - Recorded PR URL and the next continuation point after publication.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git commit -m "Add I1 backend CLI and DrawingIR"
    result: PASS
    evidence: Created commit `1b0182f`.
  - command: git push -u origin codex/i1-backend-cli-drawingir
    result: PASS
    evidence: Pushed branch and pre-push `codex:ship` completed with backend
      tests OK.
  - command: gh pr create --draft --base main --head codex/i1-backend-cli-drawingir
    result: PASS
    evidence: Created draft PR https://github.com/Gorgutc/3d_in_blueprints/pull/3
artifacts_generated: []
acceptance_gates:
  passed:
    - I1 is committed and pushed for review.
    - Draft PR targets `main`.
    - README and handoff are aligned with I1 scope and I2-I7 defers.
  failed: []
accepted_deviations:
  - One tech-stack subagent timed out during pre-PR review; the matching
    read-only stack audit was performed locally and found no runtime
    dependencies, compilers, installers, Blender packages, browser gates, or
    generated release artifacts.
explicit_defers:
  - Merge PR #3 before starting I2.
  - Check remote CI for PR #3.
  - I2 Blender Bridge and background Blender 5.1 process ownership check.
  - I3-I7 product iterations.
blockers: []
risks_or_regressions:
  - Direct Python probes outside `scripts/run-python-tests.mjs` can recreate
    ignored `__pycache__`; check before future staging.
repo_state: branch codex/i1-backend-cli-drawingir published as draft PR #3
next_iteration_ready: false
resume_prompt: Review and merge PR #3 at https://github.com/Gorgutc/3d_in_blueprints/pull/3. After PR #3 is merged into `main`, start I2 Blender Bridge from updated `main` and first check the existing background Blender 5.1 process ownership.
```
