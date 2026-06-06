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

```yaml
iteration_id: I2-blender-bridge
status: PASS
date: 2026-06-06
scope_completed:
  - Started from updated `main` after PR #3 was merged.
  - Created branch `codex/i2-blender-bridge`.
  - Checked running Blender processes before I2 smoke work; active processes
    were Blender 5.2 beta, not Blender 5.1.
  - Added Blender add-on package `blender_addon/blueprints_addon`.
  - Added Blender 5.1 `bl_info`, preferences, generate operator, sidebar
    panel, and deterministic register/unregister contract.
  - Added SceneSnapshot JSON export for visible scene objects.
  - Added OBJ/GLB scene asset export into a temporary backend job folder.
  - Added backend subprocess bridge using `<python> -m blueprints_backend
    <job-folder>` with local `backend/src` on `PYTHONPATH`.
  - Kept the add-on as a thin client: backend jobs contain SceneSnapshot and
    asset references only, not synthesized drawing entities.
  - Added backend-side placeholder DrawingIR generation for SceneSnapshot jobs
    with a `projection_pending` warning until CAD projection lands.
  - Added bridge diagnostics for backend spawn failures, invalid/missing
    diagnostics, and missing required backend outputs.
  - Added diagnostics/SVG preview import into Blender Text data-blocks.
  - Added explicit local Blender smoke command `npm.cmd run test:blender`.
  - Added stdlib bridge unit tests that run without `bpy`.
  - Updated generated artifact ignore rules for bridge job folders and exported
    OBJ/GLB/GLTF assets.
  - Documented that the handoff log is historical evidence rather than an
    active governance policy source.
  - Updated README, profile docs, verification docs, quality tooling docs,
    package scripts, PostToolUse detection, and infra verification for I2.
files_changed:
  - .gitignore
  - blender_addon/blueprints_addon/__init__.py
  - blender_addon/blueprints_addon/bridge.py
  - blender_addon/blueprints_addon/preview.py
  - blender_addon/tests/smoke_blender_bridge.py
  - blender_addon/tests/test_bridge_unit.py
  - backend/src/blueprints_backend/drawing_ir.py
  - backend/src/blueprints_backend/job.py
  - backend/tests/test_cli.py
  - scripts/run-python-tests.mjs
  - scripts/run-blender-smoke.mjs
  - scripts/check-governance.mjs
  - scripts/verify-codex-infra.mjs
  - .codex/hooks/post-tool-verify.js
  - package.json
  - plugins/blueprints-codex/skills/blueprints-quality-tooling/SKILL.md
  - AGENTS.md
  - README.md
  - docs/agent/profiles/blender-addon.md
  - docs/agent/quality-tooling.md
  - docs/agent/verification.md
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git pull --ff-only origin main
    result: PASS
    evidence: Local `main` was already up to date after PR #3 merge.
  - command: git switch -c codex/i2-blender-bridge
    result: PASS
    evidence: Created I2 branch.
  - command: Blender process inventory
    result: PASS
    evidence: Found active Blender 5.2 beta processes; Blender 5.1 install is
      available separately.
  - command: npm.cmd run check:js
    result: PASS
    evidence: 10/10 JavaScript syntax checks passed.
  - command: npm.cmd run verify
    result: PASS
    evidence: 223/223 infrastructure checks passed.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: 6 backend stdlib tests and 3 bridge unit tests passed.
  - command: npm.cmd run test:blender
    result: PASS
    evidence: Final rerun after drift fixes used Blender 5.1.2, exported OBJ,
      ran backend, loaded diagnostics/SVG preview Text data-blocks, and quit
      cleanly.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: plugin 214/214, governance 750/750, JS 10/10, infra 223/223,
      backend 6 tests OK, bridge unit 3 tests OK.
  - command: git diff --check
    result: PASS
    evidence: No whitespace errors; Git reported CRLF normalization warnings
      only.
  - command: generated artifact scan
    result: PASS
    evidence: No repo `__pycache__`, OBJ/GLB/GLTF, package, installer,
      DXF/PDF/DWG, log, or temp artifacts found.
artifacts_generated: []
acceptance_gates:
  passed:
    - Add-on entrypoint and `bl_info` for Blender 5.1 exist.
    - SceneSnapshot JSON and OBJ/GLB export contract exists.
    - Backend subprocess uses the I1 job-folder CLI contract.
    - Add-on job payload stays source-only; backend owns placeholder drawing
      synthesis and emits a `projection_pending` warning.
    - Spawn failures, invalid/missing diagnostics, and missing required outputs
      are converted into diagnostics instead of crashing the Blender operator.
    - Diagnostics and SVG preview are loaded into Blender Text data-blocks.
    - Headless Blender 5.1 smoke passes locally.
    - No `__pycache__`, OBJ/GLB, package, installer, DXF/PDF/DWG, or release
      artifacts remain in the repo after smoke.
  failed: []
accepted_deviations:
  - `test:blender` is explicit and local; it is not part of `codex:ship` so CI
    remains Blender-runtime-neutral.
  - PostToolUse detects `blender_addon/` edits but runs `quality:deep`; final
    I2 delivery also ran `test:blender` explicitly.
  - Earlier instruction-drift, deadwood, and code-quality agent FAIL findings
    were fixed in this branch.
  - Some required reviewer roles hit the thread/subagent availability limit;
    missing roles must be covered by explicit local fallback review before
    final delivery.
  - `docs/handoff/ITERATION_LOG.md` is a historical handoff ledger, not an
    active governance policy source; it can preserve command evidence counts.
explicit_defers:
  - Add-on zip, backend bundle, version stamping, release docs, and packaging
    smoke remain I7.
  - FreeCAD/TechDraw execution and CAD projection remain deferred.
  - GOST composition, dimensions, standards DB, image assist, DXF/PDF, and DWG
    remain deferred.
  - Visual drawing preview beyond Text data-block import remains deferred.
blockers: []
risks_or_regressions:
  - Active Blender 5.2 beta processes were present during I2; smoke explicitly
    used Blender 5.1.2, but future tests should keep checking process state.
  - Blender may create Python `__pycache__`; `scripts/run-blender-smoke.mjs`
    now cleans cache under `backend` and `blender_addon` after smoke.
repo_state: dirty working branch codex/i2-blender-bridge; I2 implementation is
  not staged, committed, pushed, or opened as a PR.
next_iteration_ready: false
resume_prompt: Continue I2 publication from `codex/i2-blender-bridge` by committing the verified implementation, pushing the branch, and opening the I2 PR. Rerun `npm.cmd run test:blender` and `npm.cmd run codex:ship` if the diff changes before publication.
```

```yaml
iteration_id: I2-pr-publication
status: PASS
date: 2026-06-06
scope_completed:
  - Committed I2 implementation as `332fea9 Add I2 Blender bridge`.
  - Pushed `codex/i2-blender-bridge` to origin.
  - Opened draft PR #4 for I2.
  - Preserved I2 defers for projection, standards, exports, image assist, and
    packaging.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git commit -m "Add I2 Blender bridge"
    result: PASS
    evidence: Created commit `332fea9`; pre-commit quality gate passed.
  - command: git push -u origin codex/i2-blender-bridge
    result: PASS
    evidence: Pushed branch and pre-push `codex:ship` passed with plugin
      214/214, governance 750/750, JS 10/10, infra 223/223, backend 6 tests
      OK, and bridge unit 3 tests OK.
  - command: gh pr create --draft --base main --head codex/i2-blender-bridge
    result: PASS
    evidence: Created draft PR https://github.com/Gorgutc/3d_in_blueprints/pull/4
artifacts_generated: []
acceptance_gates:
  passed:
    - I2 implementation is committed and pushed for review.
    - Draft PR #4 targets `main`.
    - Handoff records the PR publication state.
  failed: []
accepted_deviations:
  - PR is draft, matching the repo publish workflow.
  - `test:blender` remains a local explicit smoke outside CI `codex:ship`.
explicit_defers:
  - Check remote CI for PR #4.
  - Review and merge PR #4 before starting I3 GOST Composer.
  - I3-I7 product iterations remain pending.
blockers: []
risks_or_regressions:
  - Active Blender 5.2 beta processes were present during I2; local smoke used
    Blender 5.1.2 explicitly.
repo_state: branch codex/i2-blender-bridge published as draft PR #4
next_iteration_ready: false
resume_prompt: Review PR #4 at https://github.com/Gorgutc/3d_in_blueprints/pull/4 and confirm CI. After PR #4 is merged into `main`, start I3 GOST Composer from updated `main`.
```

```yaml
iteration_id: I3-gost-composer
status: PASS
date: 2026-06-06
scope_completed:
  - Started from synced `main` after PR #4 was merged.
  - Created branch `codex/i3-gost-composer`.
  - Added backend-owned GOST v1 sheet composition behind
    `sheet.standard: "GOST"`.
  - Added A4 portrait frame margins, drawing area metadata, title block
    metadata, title block grid lines, and title text as DrawingIR
    `sheet_elements`.
  - Added GOST line layers for `frame`, `thin`, `text`, `visible`, and
    `hidden`.
  - Kept the Blender add-on thin: it requests GOST sheet metadata in the
    backend job payload but does not synthesize drawing entities.
  - Added a GOST backend fixture and deterministic golden SVG coverage.
  - Fixed review-found GOST validation gap so `standard: "GOST"` requires A4
    portrait dimensions of 210x297 mm, not only `format: "A4"`.
  - Updated README, Blender add-on profile docs, verification docs, quality
    tooling docs, and infrastructure verification to include I3.
files_changed:
  - README.md
  - backend/src/blueprints_backend/drawing_ir.py
  - backend/src/blueprints_backend/gost.py
  - backend/src/blueprints_backend/job.py
  - backend/src/blueprints_backend/svg_writer.py
  - backend/tests/fixtures/golden_gost_a4.svg
  - backend/tests/fixtures/gost_job.json
  - backend/tests/test_cli.py
  - blender_addon/blueprints_addon/bridge.py
  - blender_addon/tests/test_bridge_unit.py
  - docs/agent/profiles/blender-addon.md
  - docs/agent/quality-tooling.md
  - docs/agent/verification.md
  - docs/handoff/ITERATION_LOG.md
  - scripts/verify-codex-infra.mjs
commands_run:
  - command: git switch -c codex/i3-gost-composer
    result: PASS
    evidence: Created I3 branch from clean synced `main`.
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED phase failed because the new GOST golden expected frame and
      title block output before the composer existed.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: GREEN phase passed with 7 backend tests and 3 bridge unit tests
      after adding GOST composition.
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED bridge phase failed with `KeyError: 'standard'` before the
      bridge requested GOST sheet composition.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: Fresh run passed with 7 backend tests and 3 bridge unit tests.
  - command: npm.cmd run test:blender
    result: PASS
    evidence: Fresh smoke used Blender 5.1.2, exported OBJ, ran backend, and
      quit cleanly.
  - command: local fallback /review
    result: FAIL
    evidence: Code quality and verification reviewers found that GOST v1
      accepted non-A4 portrait dimensions when `format` was `A4`.
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED regression confirmed landscape 297x210 GOST payload returned
      success before validation was tightened.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: GREEN rerun passed with 8 backend tests and 3 bridge unit tests
      after enforcing GOST A4 portrait dimensions.
  - command: npm.cmd run test:blender
    result: PASS
    evidence: Post-fix fresh smoke used Blender 5.1.2, exported OBJ, ran
      backend, and quit cleanly.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: plugin 214/214, governance 750/750, JS 10/10, infra 233/233,
      backend 8 tests OK, and bridge unit 3 tests OK.
  - command: git diff --check
    result: PASS
    evidence: No whitespace errors; Git reported CRLF normalization warnings
      only.
  - command: generated artifact scan
    result: PASS
    evidence: No repo `__pycache__`, OBJ/GLB/GLTF, DXF/PDF/DWG, package,
      installer, log, or temp artifacts found under backend or blender_addon.
  - command: explicit subagent and fallback review
    result: PASS
    evidence: Code quality and verification reviewers first found the GOST
      dimension-validation blocker, then passed after the RED/GREEN fix.
      Blender, frozen-decision, instruction-drift, quality-tooling, deadwood,
      reuse, runtime, tech-stack, and visual QA roles reported no blockers.
      Codex-infra and Windows packaging roles timed out and were covered by
      documented local fallback review with no blockers.
artifacts_generated:
  - backend/tests/fixtures/golden_gost_a4.svg
acceptance_gates:
  passed:
    - GOST v1 is opt-in through `sheet.standard: "GOST"`.
    - GOST v1 supports and validates A4 portrait sheet composition.
    - DrawingIR includes sheet metadata and `sheet_elements` for the frame,
      title block, grid, and title text.
    - Deterministic SVG output matches the committed GOST golden fixture.
    - Blender bridge remains source-only and requests backend sheet
      composition.
    - `codex:ship` passed with `0 FAIL`.
    - No FreeCAD/TechDraw, OCCT, compiler, installer, package, or generated
      release artifact was added.
  failed: []
accepted_deviations:
  - GOST v1 uses a deliberately narrow frame/title block subset; detailed GOST
    title block semantics remain deferred until later standards work.
  - Two read-only review roles timed out after extended waits; matching
    Codex-infra and Windows packaging fallback reviews were performed locally.
explicit_defers:
  - FreeCAD/TechDraw execution and CAD projection.
  - I4 dimensions.
  - I5 standards database and fastener matching.
  - I6 image assist.
  - I7 add-on zip, backend bundle, release docs, version stamping, crash logs,
    CI matrix, and packaging smoke.
  - DXF/PDF derived exports and DWG.
blockers: []
risks_or_regressions:
  - Future projection work must avoid letting the bridge synthesize drawing
    entities; backend remains the source of truth.
  - Active Blender 5.2 beta processes existed during I2; I3 smoke explicitly
    used Blender 5.1.2.
repo_state: dirty working branch codex/i3-gost-composer; I3 implementation is
  not staged, committed, pushed, or opened as a PR.
next_iteration_ready: false
resume_prompt: Finish I3 publication from `codex/i3-gost-composer`: run fresh
  `npm.cmd run codex:ship`, complete `/review` or documented fallback review,
  stage, commit, push, and open the I3 PR.
```

```yaml
iteration_id: I3-pr-publication
status: PASS
date: 2026-06-06
scope_completed:
  - Committed I3 implementation as `ed4c60e Add I3 GOST composer`.
  - Pushed `codex/i3-gost-composer` to origin.
  - Opened draft PR #5 for I3.
  - Preserved I3 defers for projection, dimensions, standards, exports, image
    assist, and packaging.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git commit -m "Add I3 GOST composer"
    result: PASS
    evidence: Created commit `ed4c60e`; pre-commit `quality:fast` passed.
  - command: git push -u origin codex/i3-gost-composer
    result: PASS
    evidence: Pushed branch and pre-push `codex:ship` passed with plugin
      214/214, governance 750/750, JS 10/10, infra 233/233, backend 8 tests
      OK, and bridge unit 3 tests OK.
  - command: GitHub connector create draft PR
    result: PASS
    evidence: Created draft PR https://github.com/Gorgutc/3d_in_blueprints/pull/5
artifacts_generated: []
acceptance_gates:
  passed:
    - I3 implementation is committed and pushed for review.
    - Draft PR #5 targets `main`.
    - Handoff records the PR publication state.
  failed: []
accepted_deviations:
  - PR is draft, matching the repo publish workflow.
explicit_defers:
  - Check remote CI for PR #5.
  - Review and merge PR #5 before starting I4 Dimensions v1.
  - I4-I7 product iterations remain pending.
blockers: []
risks_or_regressions:
  - Active Blender 5.2 beta processes were present during I2; I3 local smoke
    used Blender 5.1.2 explicitly.
repo_state: branch codex/i3-gost-composer published as draft PR #5
next_iteration_ready: false
resume_prompt: Review PR #5 at https://github.com/Gorgutc/3d_in_blueprints/pull/5 and confirm CI. After PR #5 is merged into `main`, start I4 Dimensions v1 from updated `main`.
```

```yaml
iteration_id: I4-dimensions-v1
status: PASS
date: 2026-06-06
scope_completed:
  - Started from synced `main` after PR #5 was merged.
  - Created branch `codex/i4-dimensions-v1`.
  - Added backend-owned explicit basic dimension annotations through
    `view.dimensions[]`.
  - Added DrawingIR dimension records on a dedicated `dimension` layer.
  - Added deterministic SVG rendering for linear, diameter, radius, hole, and
    center-distance dimensions.
  - Added validation for supported dimension payloads and warnings for
    unsupported dimension types.
  - Fixed review-found scale handling so diameter and hole leaders account for
    `view.scale`.
  - Fixed review-found duplicate `view.id` handling by rejecting duplicates and
    avoiding id-keyed dimension lookup in DrawingIR.
  - Consolidated the supported dimension type contract into
    `dimensions.SUPPORTED_DIMENSION_TYPES`.
  - Added a dimensioned A4 GOST job fixture and golden SVG coverage.
  - Updated README, Blender add-on profile docs, verification docs, quality
    tooling docs, and infrastructure verification for I4.
  - Added infrastructure regression checks for duplicate view ids, ordered
    dimension assignment, shared supported dimension types, and scaled
    model-derived leader lengths.
files_changed:
  - README.md
  - backend/src/blueprints_backend/dimensions.py
  - backend/src/blueprints_backend/drawing_ir.py
  - backend/src/blueprints_backend/job.py
  - backend/src/blueprints_backend/svg_writer.py
  - backend/tests/fixtures/dimensions_job.json
  - backend/tests/fixtures/golden_dimensions_a4.svg
  - backend/tests/test_cli.py
  - docs/agent/profiles/blender-addon.md
  - docs/agent/quality-tooling.md
  - docs/agent/verification.md
  - docs/handoff/ITERATION_LOG.md
  - plugins/blueprints-codex/skills/blueprints-quality-tooling/SKILL.md
  - scripts/verify-codex-infra.mjs
commands_run:
  - command: git switch -c codex/i4-dimensions-v1
    result: PASS
    evidence: Created I4 branch from clean synced `main`.
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED phase failed because the dimension golden expected SVG
      annotations and unsupported-dimension warnings before I4 existed.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: GREEN phase passed with 10 backend tests and 3 bridge unit tests
      after adding Dimensions v1.
  - command: component reuse final audit
    result: FAIL
    evidence: Found unscaled diameter and hole leader offsets for non-1:1 views
      and duplicated supported dimension type constants.
  - command: code deadwood final audit
    result: FAIL
    evidence: Found the duplicated supported dimension type contract between
      `job.py` and `dimensions.py`.
  - command: code quality final audit
    result: FAIL
    evidence: Found duplicate `view.id` values could corrupt dimension
      assignment because DrawingIR used an id-keyed dimension lookup.
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED regression tests confirmed non-1:1 diameter and hole leaders
      used unscaled offsets, and duplicate view ids were accepted.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: GREEN rerun passed with 12 backend tests and 3 bridge unit tests
      after fixing scaled leaders, duplicate view id validation, and the
      supported type source of truth.
  - command: npm.cmd run test:blender
    result: PASS
    evidence: Final smoke used Blender 5.1.2, exported OBJ, ran backend,
      loaded diagnostics/SVG preview, and quit cleanly after the backend
      regression fixes.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Fresh post-fix ship gate passed with plugin 214/214, governance
      750/750, JS 10/10, infra 249/249, backend 12 tests OK, and bridge unit
      3 tests OK.
  - command: generated artifact scan
    result: FAIL
    evidence: Deadwood audit found ignored `backend/src/blueprints_backend/__pycache__`
      after local Python probes.
  - command: generated artifact cleanup
    result: PASS
    evidence: Removed only resolved `__pycache__` paths under the repository
      backend path.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Fresh post-cleanup and post-verifier-update ship gate passed
      again with plugin 214/214, governance 750/750, JS 10/10, infra 254/254,
      backend 12 tests OK, and bridge unit 3 tests OK.
  - command: git diff --check
    result: PASS
    evidence: No whitespace errors; Git reported CRLF normalization warnings
      only.
  - command: generated artifact scan
    result: PASS
    evidence: No repo `__pycache__`, OBJ/GLB/GLTF, DXF/PDF/DWG, package,
      installer, log, or temp artifacts found under backend or blender_addon.
  - command: explicit subagent and fallback review
    result: PASS
    evidence: Fresh code quality, component reuse, deadwood, visual QA,
      instruction drift, frozen-decision, and quality-tooling reviews found no
      remaining blockers after fixes. Runtime behavior and tech-stack roles
      timed out and were covered by documented local fallback review with no
      new runtime commands, dependencies, compilers, installers, FreeCAD/TechDraw,
      Blender runtime activation, browser gates, packaging, or derived export
      activation in I4.
artifacts_generated:
  - backend/tests/fixtures/golden_dimensions_a4.svg
acceptance_gates:
  passed:
    - `view.dimensions[]` accepts explicit basic dimension annotations.
    - Supported I4 dimension types are `linear`, `diameter`, `radius`, `hole`,
      and `center_distance`.
    - Unsupported dimension types emit `unsupported_dimension` diagnostics and
      are skipped from DrawingIR.
    - Deterministic SVG output matches the committed dimensions golden fixture.
    - Diameter and hole leaders follow `view.scale` for model-derived diameter
      offsets.
    - Duplicate `view.id` values return diagnostics instead of corrupting
      dimension assignment.
  failed: []
accepted_deviations: []
explicit_defers:
  - Automatic projection-derived dimensions.
  - Angular dimensions, ordinate dimensions, tolerances, and detailed GOST
    dimensioning rules.
  - I5 standards database and fastener matching.
  - I6 image assist.
  - I7 add-on zip, backend bundle, release docs, version stamping, crash logs,
    CI matrix, and packaging smoke.
  - FreeCAD/TechDraw execution, DXF/PDF derived exports, and DWG.
blockers: []
risks_or_regressions:
  - Dimension placement is explicit and fixture-driven in I4; future projection
    work must not move inference into the Blender bridge.
  - SVG dimension placement uses fixed offsets and has no collision avoidance;
    broader dimension-layout work needs rendered evidence before PASS.
repo_state: dirty working branch codex/i4-dimensions-v1; I4 implementation is
  not staged, committed, pushed, or opened as a PR.
next_iteration_ready: false
resume_prompt: Finish I4 publication from `codex/i4-dimensions-v1`: run fresh
  `npm.cmd run codex:ship`, complete `/review` or documented fallback review,
  stage, commit, push, and open the I4 PR.
```

```yaml
iteration_id: I4-pr-publication
status: PASS
date: 2026-06-06
scope_completed:
  - Committed I4 implementation as `4227be6 Add I4 dimensions v1`.
  - Pushed `codex/i4-dimensions-v1` to origin.
  - Opened draft PR #6 for I4.
  - Preserved I4 defers for projection-derived dimensions, angular/ordinate
    dimensions, tolerances, detailed GOST rules, standards, image assist,
    exports, and packaging.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git commit -m "Add I4 dimensions v1"
    result: PASS
    evidence: Created commit `4227be6`; pre-commit `quality:fast` passed with
      plugin 214/214, governance 750/750, JS 10/10, and infra 254/254.
  - command: git push -u origin codex/i4-dimensions-v1
    result: PASS
    evidence: Pushed branch and pre-push `codex:ship` passed with plugin
      214/214, governance 750/750, JS 10/10, infra 254/254, backend 12 tests
      OK, and bridge unit 3 tests OK.
  - command: GitHub connector create draft PR
    result: PASS
    evidence: Created draft PR https://github.com/Gorgutc/3d_in_blueprints/pull/6
artifacts_generated: []
acceptance_gates:
  passed:
    - I4 implementation is committed and pushed for review.
    - Draft PR #6 targets `main`.
    - Handoff records the PR publication state.
  failed: []
accepted_deviations:
  - PR is draft, matching the repo publish workflow.
explicit_defers:
  - Check remote CI for PR #6.
  - Review and merge PR #6 before starting I5 Standards DB.
  - I5-I7 product iterations remain pending.
blockers: []
risks_or_regressions:
  - SVG dimension placement still uses fixed offsets and no collision avoidance;
    future broader dimension-layout work needs rendered evidence before PASS.
repo_state: branch codex/i4-dimensions-v1 published as draft PR #6
next_iteration_ready: false
resume_prompt: Review PR #6 at https://github.com/Gorgutc/3d_in_blueprints/pull/6 and confirm CI. After PR #6 is merged into `main`, start I5 Standards DB from updated `main`.
```

```yaml
iteration_id: I5-standards-db
status: PASS
date: 2026-06-06
scope_completed:
  - Added backend-owned Standards DB v1 fastener matching behind
    `standards.fastener_matches[]` in `job.json`.
  - Added a local stdlib-only starter fastener catalog for `bolt`, `nut`, and
    `washer` families.
  - Recorded source and license metadata for the starter catalog as
    project-authored, non-normative data with no third-party standards table
    copied.
  - Added matcher output under `standards` in DrawingIR and diagnostics for
    jobs that request standards matching.
  - Added diagnostics warnings for unsupported fastener families, unmatched
    nominal diameters, and references to skipped or missing dimensions.
  - Added validation for standards match payloads, duplicate standards match
    ids, and duplicate per-view dimension ids.
  - Kept SVG output unchanged for I5; standards matching does not add layout or
    visual annotations in this iteration.
  - Updated README, Blender profile, verification docs, quality-tooling docs,
    quality-tooling skill, and infra verifier for I5.
files_changed:
  - README.md
  - backend/src/blueprints_backend/cli.py
  - backend/src/blueprints_backend/diagnostics.py
  - backend/src/blueprints_backend/drawing_ir.py
  - backend/src/blueprints_backend/job.py
  - backend/src/blueprints_backend/standards.py
  - backend/src/blueprints_backend/data/standards_fasteners.json
  - backend/tests/fixtures/standards_job.json
  - backend/tests/test_cli.py
  - docs/agent/profiles/blender-addon.md
  - docs/agent/quality-tooling.md
  - docs/agent/verification.md
  - docs/handoff/ITERATION_LOG.md
  - plugins/blueprints-codex/skills/blueprints-quality-tooling/SKILL.md
  - scripts/verify-codex-infra.mjs
commands_run:
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED phase confirmed missing I5 behavior; standards diagnostics
      and warning assertions failed before standards implementation.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: GREEN phase passed with 15 backend tests OK and 3 bridge unit
      tests OK after adding the first I5 matcher implementation.
  - command: explicit subagent and fallback review
    result: FAIL
    evidence: Code quality, component reuse, instruction drift, frozen-decision,
      quality-tooling, and verification reviewers found blockers around eager
      standards catalog loading, raw unsupported dimension references, duplicate
      ids, `standards: null`, and missing I5 handoff.
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED regression phase reproduced reviewer-found bugs for duplicate
      dimension ids, duplicate standards match ids, eager standards catalog
      loading, and unsupported-dimension references.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: Post-fix backend gate passed with 20 backend tests OK and 3 bridge
      unit tests OK.
  - command: npm.cmd run verify
    result: PASS
    evidence: I5 infra verifier passed with 279/279 checks and 0 FAIL.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Fresh final ship gate passed with plugin 214/214, governance
      750/750, JS 10/10, infra 279/279, backend 20 tests OK, and bridge unit
      3 tests OK.
artifacts_generated: []
acceptance_gates:
  passed:
    - `standards.fastener_matches[]` accepts explicit fastener match requests.
    - Supported I5 fastener families are `bolt`, `nut`, and `washer`.
    - Catalog entries include explicit project-authored source and license
      metadata.
    - Unsupported families emit `unsupported_standard_family` warnings and are
      skipped.
    - Unmatched nominal diameters emit `standard_match_not_found` warnings and
      are skipped.
    - Standards references to missing or unsupported dimensions emit
      `standard_reference_not_found` warnings and are skipped.
    - Non-standards jobs do not load the standards catalog.
    - Duplicate view ids, duplicate dimension ids, and duplicate standards match
      ids return diagnostics errors instead of ambiguous matches.
    - SVG output remains unchanged for standards matching in I5.
  failed: []
accepted_deviations:
  - Starter standards data is intentionally non-normative project-authored
    metadata for matcher plumbing; normative standards tables remain deferred.
explicit_defers:
  - Normative standards tables and exact fastener geometry.
  - Automatic fastener detection and BOM generation.
  - FreeCAD/TechDraw projection and hidden-line extraction.
  - Image assist.
  - DXF/PDF derived exports and DWG.
  - Add-on zip, backend bundle, release docs, version stamping, crash logs, CI
    matrix, and packaging smoke.
blockers: []
risks_or_regressions:
  - The starter catalog is not a normative standards authority and must not be
    presented as exact GOST/ISO/engineering reference data.
  - I5 emits metadata matches only; future visual standards annotations need
    separate rendered/golden evidence.
repo_state: dirty working branch codex/i5-standards-db; final review, commit,
  push, and PR publication still pending.
next_iteration_ready: false
resume_prompt: Finish I5 publication from `codex/i5-standards-db`: run fresh
  `npm.cmd run codex:ship`, complete `/review` or documented fallback review,
  stage, commit, push, and open the I5 PR.
```

```yaml
iteration_id: I5-pr-publication
status: PASS
date: 2026-06-06
scope_completed:
  - Committed I5 implementation as `a3a9b54 Add I5 standards DB`.
  - Pushed `codex/i5-standards-db` to origin.
  - Opened draft PR #7 for I5.
  - Preserved I5 defers for normative standards tables, exact fastener geometry,
    automatic fastener detection, BOM generation, image assist, FreeCAD/TechDraw,
    DXF/PDF/DWG, and packaging.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git commit -m "Add I5 standards DB"
    result: PASS
    evidence: Created commit `a3a9b54`; pre-commit `quality:fast` passed with
      plugin 214/214, governance 750/750, JS 10/10, and infra 279/279.
  - command: git push -u origin codex/i5-standards-db
    result: PASS
    evidence: Pushed branch and pre-push `codex:ship` passed with plugin
      214/214, governance 750/750, JS 10/10, infra 279/279, backend 20 tests
      OK, and bridge unit 3 tests OK.
  - command: GitHub connector create draft PR
    result: PASS
    evidence: Created draft PR https://github.com/Gorgutc/3d_in_blueprints/pull/7
artifacts_generated: []
acceptance_gates:
  passed:
    - I5 implementation is committed and pushed for review.
    - Draft PR #7 targets `main`.
    - Handoff records the PR publication state.
  failed: []
accepted_deviations:
  - PR is draft, matching the repo publish workflow.
explicit_defers:
  - Check remote CI for PR #7.
  - Review and merge PR #7 before starting I6 Image Assist.
  - I6-I7 product iterations remain pending.
blockers: []
risks_or_regressions:
  - Starter standards data remains non-normative; future standards work must
    add audited source/licensing before expanding into normative tables.
repo_state: branch codex/i5-standards-db published as draft PR #7
next_iteration_ready: false
resume_prompt: Review PR #7 at https://github.com/Gorgutc/3d_in_blueprints/pull/7 and confirm CI. After PR #7 is merged into `main`, start I6 Image Assist from updated `main`.
```

```yaml
iteration_id: I6-image-assist
status: PASS
date: 2026-06-06
scope_completed:
  - Added backend-owned Image Assist v1 behind optional `image_assist` in
    `job.json`.
  - Kept Image Assist in assistive mode only; overlays are hints and not exact
    engineering geometry.
  - Added relative contour overlays through `contour.points_rel`.
  - Added relative circle primitive hints through `primitive_hint`.
  - Added relative dimension hints through `relative_dimension`.
  - Added DrawingIR `image_assist` records with `units: "relative"`.
  - Added deterministic `assist_overlay.svg` output and diagnostics
    `outputs.image_assist_overlay` registration for jobs that request image
    assist.
  - Added validation that rejects absolute `*_mm` image-assist overlay
    coordinates unless `scale.reference_mm_per_unit` is explicit.
  - Added diagnostics warnings for unsupported overlay and primitive types,
    which are skipped while supported overlays still render.
  - Kept I6 stdlib-only with no PIL, OpenCV, NumPy, scikit-image,
    FreeCAD/TechDraw, OCCT, or image/CAD subprocess runtime dependencies.
  - Updated README, Blender profile, verification docs, quality-tooling docs,
    code/quality skills, artifact policy, infra verifier, fixtures, and tests.
files_changed:
  - DO_NOT_PUSH.md
  - README.md
  - backend/src/blueprints_backend/cli.py
  - backend/src/blueprints_backend/diagnostics.py
  - backend/src/blueprints_backend/drawing_ir.py
  - backend/src/blueprints_backend/image_assist.py
  - backend/src/blueprints_backend/job.py
  - backend/tests/fixtures/golden_image_assist_overlay.svg
  - backend/tests/fixtures/image_assist_job.json
  - backend/tests/test_cli.py
  - docs/agent/profiles/blender-addon.md
  - docs/agent/quality-tooling.md
  - docs/agent/verification.md
  - docs/handoff/ITERATION_LOG.md
  - plugins/blueprints-codex/skills/blueprints-code-rules/SKILL.md
  - plugins/blueprints-codex/skills/blueprints-quality-tooling/SKILL.md
  - scripts/verify-codex-infra.mjs
commands_run:
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED phase confirmed missing I6 behavior; `assist_overlay.svg`
      was absent, absolute overlay coordinates were accepted, and unsupported
      overlays produced no warning.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: GREEN phase passed with 23 backend tests OK and 3 bridge unit
      tests OK after adding the I6 implementation.
  - command: explicit spawned subagents
    result: FAIL
    evidence: Frozen-decision, instruction-drift, and Blender reviewers
      reported intermediate blockers for missing docs/verifier/handoff and
      artifact policy coverage before those files were updated.
  - command: component reuse reviewer
    result: FAIL
    evidence: Reviewer found duplicated SVG/measure helpers in
      `image_assist.py` and hard-error validation for unsupported future
      overlays carrying `*_mm` fields.
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED regression reproduced the reuse finding; unsupported
      `texture_map` overlay with `points_mm` returned non-zero instead of
      warning+skip.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: Post-fix backend gate passed with 23 backend tests OK and 3
      bridge unit tests OK after reusing existing formatting helpers and
      preserving unsupported overlay warning behavior.
  - command: npm.cmd run verify
    result: PASS
    evidence: I6 infra verifier passed with 299/299 checks and 0 FAIL.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Fresh final ship gate passed with plugin 214/214, governance
      750/750, JS 10/10, infra 299/299, backend 23 tests OK, and bridge unit
      3 tests OK.
  - command: /review fallback
    result: PASS
    evidence: Slash command is not exposed as a callable tool in this session;
      performed documented fallback diff/status/scope/artifact review. Diff is
      limited to I6 backend, fixtures, docs, skills, artifact policy, handoff,
      and verifier. `git diff --check` reported only local LF-to-CRLF warnings
      and no whitespace errors. Untracked files are the expected I6 source and
      fixtures.
artifacts_generated: []
acceptance_gates:
  passed:
    - `image_assist.mode` is limited to `assistive`.
    - Supported I6 overlay types are `contour`, `primitive_hint`, and
      `relative_dimension`.
    - Supported I6 primitive hints are circle candidates.
    - Image Assist records and overlay SVG use relative units.
    - `assist_overlay.svg` is deterministic and listed in diagnostics only
      when image assist is requested.
    - Absolute image-assist overlay coordinates without explicit scale return
      `invalid_image_assist`.
    - Unsupported overlay or primitive types emit warnings and are skipped.
    - Generated backend job outputs, including `assist_overlay.svg`, are
      excluded from commits outside golden fixtures.
  failed: []
accepted_deviations:
  - I6 is backend-only; Blender UI overlay preview remains deferred because the
    current acceptance criteria only require backend-owned overlay output.
explicit_defers:
  - Blender UI overlay preview and generic extra-output preview loading.
  - Automatic image recognition, edge detection, template matching, and scale
    calibration.
  - Absolute dimensions inferred from images.
  - FreeCAD/TechDraw projection and hidden-line extraction.
  - DXF/PDF derived exports and DWG.
  - Add-on zip, backend bundle, release docs, version stamping, crash logs, CI
    matrix, and packaging smoke.
blockers: []
risks_or_regressions:
  - I6 overlay coordinates are relative hints only; future UX must not present
    them as exact dimensions without explicit scale calibration.
  - `assist_overlay.svg` is a new optional backend output; future Blender
    preview work needs `test:blender` coverage if it loads that file.
repo_state: dirty working branch codex/i6-image-assist; final commit, push, and
  PR publication still pending.
next_iteration_ready: false
resume_prompt: Finish I6 publication from `codex/i6-image-assist`: run fresh
  `npm.cmd run codex:ship`, complete `/review` or documented fallback review,
  stage, commit, push, and open the I6 PR.
```

```yaml
iteration_id: I6-pr-publication
status: PASS
date: 2026-06-06
scope_completed:
  - Committed I6 implementation as `07cd775 Add I6 image assist`.
  - Pushed `codex/i6-image-assist` to origin.
  - Opened draft PR #8 for I6.
  - Preserved I6 defers for Blender UI overlay preview, automatic image
    recognition, scale calibration, absolute dimensions inferred from images,
    FreeCAD/TechDraw, DXF/PDF/DWG, and packaging.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git commit -m "Add I6 image assist"
    result: PASS
    evidence: Created commit `07cd775`; pre-commit `quality:fast` passed with
      plugin 214/214, governance 750/750, JS 10/10, and infra 299/299.
  - command: git push -u origin codex/i6-image-assist
    result: PASS
    evidence: Pushed branch and pre-push `codex:ship` passed with plugin
      214/214, governance 750/750, JS 10/10, infra 299/299, backend 23 tests
      OK, and bridge unit 3 tests OK.
  - command: GitHub connector create draft PR
    result: PASS
    evidence: Created draft PR https://github.com/Gorgutc/3d_in_blueprints/pull/8
artifacts_generated: []
acceptance_gates:
  passed:
    - I6 implementation is committed and pushed for review.
    - Draft PR #8 targets `main`.
    - Handoff records the PR publication state.
  failed: []
accepted_deviations:
  - PR is draft, matching the repo publish workflow.
explicit_defers:
  - Check remote CI for PR #8.
  - Review and merge PR #8 before starting I7 Packaging + Hardening.
  - I7 remains pending.
blockers: []
risks_or_regressions:
  - Image Assist remains relative and assistive only; future absolute-scale
    work must add conversion/rendering tests before presenting exact dimensions.
repo_state: branch codex/i6-image-assist published as draft PR #8
next_iteration_ready: false
resume_prompt: Review PR #8 at https://github.com/Gorgutc/3d_in_blueprints/pull/8 and confirm CI. After PR #8 is merged into `main`, start I7 Packaging + Hardening from updated `main`.
```

```yaml
iteration_id: I7-packaging-hardening
status: PASS
date: 2026-06-06
scope_completed:
  - Added stdlib-only release packaging for the active Blender add-on +
    backend scope.
  - Added add-on zip packaging from `blender_addon/blueprints_addon` with the
    add-on `bl_info["version"]` as the artifact version.
  - Added backend bundle zip packaging from `backend/src/blueprints_backend`
    with `blueprints_backend.__version__` as the artifact version.
  - Added `release_manifest.json` with schema version, package version, commit
    stamp, artifact ids, source folders, and artifact versions.
  - Added `npm run test:packaging`, which writes release artifacts into a
    temporary directory and verifies required zip contents.
  - Added backend crash-log hardening for unexpected exceptions:
    `crash.log` plus `backend_crash` diagnostics output.
  - Added Windows/Linux CI matrix for `npm run codex:ship`.
  - Updated README, release docs, Blender profile, ADR wording, verification
    docs, quality-tooling docs, repo-local skills, hooks, governance, verifier,
    and artifact ignore policy for I7.
  - Kept `windows-exe` dormant; I7 only packages the active add-on/backend
    artifacts and does not add installers or executable packaging.
files_changed:
  - .codex/hooks/post-tool-verify.js
  - .github/workflows/codex-infra.yml
  - .gitignore
  - AGENTS.md
  - README.md
  - backend/src/blueprints_backend/cli.py
  - backend/src/blueprints_backend/diagnostics.py
  - backend/tests/test_cli.py
  - backend/tests/test_packaging.py
  - docs/agent/adrs/0002-dormant-product-profiles.md
  - docs/agent/adrs/0003-blender-addon-backend-activation.md
  - docs/agent/profiles/blender-addon.md
  - docs/agent/quality-tooling.md
  - docs/agent/skill-map.md
  - docs/agent/verification.md
  - docs/handoff/ITERATION_LOG.md
  - docs/release/packaging.md
  - package.json
  - plugins/blueprints-codex/skills/blueprints-blender-addon-profile/SKILL.md
  - plugins/blueprints-codex/skills/blueprints-quality-tooling/SKILL.md
  - scripts/check-governance.mjs
  - scripts/package_release.py
  - scripts/run-packaging-smoke.mjs
  - scripts/verify-codex-infra.mjs
commands_run:
  - command: npm.cmd run test:backend
    result: FAIL
    evidence: RED phase confirmed missing I7 behavior; crash-log test raised
      the original `RuntimeError`, and packaging test failed because
      `scripts/package_release.py` did not exist.
  - command: npm.cmd run test:backend
    result: PASS
    evidence: GREEN phase passed with 25 backend tests OK and 3 Blender bridge
      unit tests OK after adding crash diagnostics and packaging.
  - command: npm.cmd run test:packaging
    result: PASS
    evidence: Packaging smoke wrote and verified 2 temporary artifacts.
  - command: npm.cmd run check:governance
    result: PASS
    evidence: Governance scan passed with 774/774 checks and 0 FAIL after
      adding `docs/release` and Python scripts to the active scan.
  - command: npm.cmd run check:js
    result: PASS
    evidence: JavaScript syntax scan passed with 11/11 checks and 0 FAIL.
  - command: npm.cmd run verify
    result: PASS
    evidence: Infra verifier passed with 327/327 checks and 0 FAIL after adding
      the packaging-smoke-as-command guard.
  - command: git check-ignore -v docs\release\packaging.md
    result: PASS
    evidence: Command exited non-zero with no output after root-anchoring
      `/release/`, confirming the release doc is no longer ignored.
  - command: explicit spawned subagents
    result: PASS_WITH_FIXED_FINDINGS
    evidence: Frozen-decision, Blender, quality-tooling, and code-quality
      roles passed. Codex-infra and instruction-drift roles found the
      `docs/release/packaging.md` ignore blocker before `.gitignore` was fixed.
      Verification reviewer reported the RED test failures before the GREEN
      implementation. Component reuse found skill-map naming drift before
      `docs/agent/skill-map.md` and the verifier guard were fixed. Remaining
      roles were spawned after the fix or covered by fallback/local review if
      unavailable.
  - command: npm.cmd run codex:ship
    result: PASS
    evidence: Full ship gate passed with plugin 214/214, governance 774/774,
      JS 11/11, infra 327/327, backend 25 tests OK, bridge unit 3 tests OK,
      and packaging smoke PASS.
  - command: npm.cmd run test:blender
    result: PASS
    evidence: Blender 5.1.2 background smoke exported `scene.obj`, ran the
      bridge smoke, and exited successfully.
artifacts_generated:
  - Packaging smoke generated temporary add-on/backend zip artifacts and
    removed them with the temp directory.
  - Blender smoke generated temporary backend job outputs under the OS temp
    directory.
acceptance_gates:
  passed:
    - Add-on zip and backend bundle are version-stamped.
    - Release manifest records package version, commit, artifacts, sources, and
      artifact versions.
    - Packaging smoke is deterministic, stdlib-only, and temp-dir scoped.
    - Backend unexpected exceptions write `crash.log` and diagnostics with
      `outputs.crash_log`.
    - CI runs `codex:ship` on Ubuntu and Windows.
    - Generated zips and root release/dist folders are ignored, while
      `docs/release/packaging.md` remains trackable.
    - `quality:deep` and `codex:ship` include packaging smoke.
    - `windows-exe` remains dormant.
  failed: []
accepted_deviations:
  - `test:packaging` does not install the add-on inside Blender; I7 verifies
    package structure only. Blender runtime behavior remains covered by the
    explicit `test:blender` smoke.
explicit_defers:
  - Windows executable packaging, installers, code signing, and update flows.
  - FreeCAD/TechDraw execution and hidden-line extraction.
  - OCCT/C++ provider work.
  - DXF/PDF derived exports and DWG.
  - Committed release artifacts; generated release outputs remain local only.
blockers: []
risks_or_regressions:
  - Release artifacts are intentionally generated by explicit command only;
    future distribution work must define signing, installer, and publishing
    policy before producing public release packages.
  - Packaging smoke validates zip contents and manifest metadata, not Blender
    install UX.
repo_state: dirty working branch codex/i7-packaging-hardening; final commit,
  push, and PR publication still pending.
next_iteration_ready: false
resume_prompt: Finish I7 publication from `codex/i7-packaging-hardening`: run a
  fresh `npm.cmd run codex:ship`, complete `/review` or documented fallback
  review, stage, commit, push, and open the I7 PR.
```

```yaml
iteration_id: I7-pr-publication
status: PASS
date: 2026-06-06
scope_completed:
  - Committed I7 implementation as `0e115b5 Add I7 packaging hardening`.
  - Pushed `codex/i7-packaging-hardening` to origin.
  - Opened draft PR #9 for I7.
  - Preserved I7 defers for Windows executable packaging, installers, signing,
    FreeCAD/TechDraw, OCCT/C++, DXF/PDF/DWG, and committed release artifacts.
files_changed:
  - docs/handoff/ITERATION_LOG.md
commands_run:
  - command: git commit -m "Add I7 packaging hardening"
    result: PASS
    evidence: Created commit `0e115b5`; pre-commit `quality:fast` passed with
      plugin 214/214, governance 774/774, JS 11/11, and infra 327/327.
  - command: git push -u origin codex/i7-packaging-hardening
    result: PASS
    evidence: Pushed branch and pre-push `codex:ship` passed with plugin
      214/214, governance 774/774, JS 11/11, infra 327/327, backend 25 tests
      OK, bridge unit 3 tests OK, and packaging smoke PASS.
  - command: GitHub connector create draft PR
    result: PASS
    evidence: Created draft PR https://github.com/Gorgutc/3d_in_blueprints/pull/9
artifacts_generated: []
acceptance_gates:
  passed:
    - I7 implementation is committed and pushed for review.
    - Draft PR #9 targets `main`.
    - Handoff records the PR publication state.
  failed: []
accepted_deviations:
  - PR is draft, matching the repo publish workflow.
explicit_defers:
  - Check remote CI for PR #9.
  - Review and merge PR #9 before starting the next product iteration.
blockers: []
risks_or_regressions:
  - Generated release artifacts remain local-only until a future distribution
    task defines signing, installer, and publishing policy.
repo_state: branch codex/i7-packaging-hardening published as draft PR #9
next_iteration_ready: false
resume_prompt: Review PR #9 at https://github.com/Gorgutc/3d_in_blueprints/pull/9
  and confirm CI. After PR #9 is merged into `main`, continue from updated
  `main` with the next approved iteration.
```
