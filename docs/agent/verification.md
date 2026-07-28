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
npm run test:packaging
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
- exact package-script graph, CI topology, hook configuration, Lefthook/native
  parity, compatibility pointers, and frozen-decision live projections;
- executable native-hook installer behavior in isolated temporary Git
  repositories: import/CLI truthfulness, normal and linked worktrees, relative
  and absolute `core.hooksPath`, exact managed and legacy ownership, full
  two-target preflight, parent/non-repository rejection, non-regular, hardlink,
  symlink/junction/reparse guards, hermetic system/global/env/template Git
  configuration, confined active paths, and live-hook before/after sentinels;
- native-hook process and transaction failures, including spawn, timeout,
  signal, status, stderr/path ambiguity, mkdir, staged write, chmod,
  second-target rename, final read-back, active-path change, exact rollback,
  verified recovery preservation, corrupt/unverified recovery rejection,
  created-directory cleanup, and absence of false success output or unintended
  temporary debris;
- executable `SessionStart` and `UserPromptSubmit` behavior, including exact
  envelopes and event-specific context, deterministic/no-output cases,
  malformed and typed prompt input, process failures, and negative semantic
  mutants for scope, profiles, `codex:ship`, and review/fallback;
- structural PostToolUse classification for path lists, MultiEdit and
  apply_patch payloads, including malformed payloads, traversal, drive, UNC,
  Win32 aliases, strongest-route selection, short-circuiting, and propagated
  command failures;
- fail-closed JavaScript discovery and process handling for missing, unreadable,
  symlinked, escaped, empty, invalid-syntax, error, signal, null-status, timeout,
  and empty-output cases;
- exact Python test-module inventory before interpreter discovery, including an
  independent ordered oracle, nonzero per-root discovery, one isolated deletion
  mutant per allowlisted module, additive, duplicate, renamed, nested, case-alias, package
  marker, path-contract, missing/unreadable root, symlink/junction, wrong-type,
  unsupported entry, import-side-effect, no-spawn-on-failure, and two-suite
  order cases;
- append-only historical handoff log presence.
- backend CLI, DrawingIR, SVG, and diagnostics behavior covered by Python
  stdlib `unittest` tests.
- GOST v1 sheet composition covered by backend golden SVG tests.
- Dimensions v1 explicit annotation behavior covered by backend golden SVG and
  unsupported-dimension diagnostics tests.
- Standards DB v1 fastener matching covered by backend fixture tests for
  source/license metadata, unsupported-family warnings, unmatched-diameter
  warnings, and unchanged SVG output.
- Image Assist v1 covered by backend fixture tests for relative overlay SVG
  output, diagnostics output registration, unsupported overlay warnings, and
  rejection of absolute overlay coordinates without explicit scale.
- Packaging and crash hardening covered by backend crash-log diagnostics tests,
  packaging manifest tests, and `npm run test:packaging` temporary artifact
  smoke.
- Backend negative contracts in `backend/tests/test_job_contracts.py` cover
  normalized POSIX-relative source paths; POSIX/Windows rooted, drive-relative,
  UNC, traversal, backslash-relative, and non-normalized rejection; missing,
  directory, empty, symlink, and resolved-escape sources; SceneSnapshot
  UTF-8/JSON/object/schema validation; entity-ID and layer rules; and XML
  1.0-invalid text rejection.
- SVG-ID cases in `backend/tests/test_svg_ids.py` cover injective namespaces
  across views/entities/dimensions/sheet elements, Image Assist part-collision
  resistance, logical-ID trace attributes, deterministic output, invalid XML
  text rejection, and preservation of legacy non-ID SVG structure.
- Bridge and operator unit cases cover explicit Backend Source package
  entrypoints, installed add-on blank-configuration failure, trusted backend
  cwd plus an absolute job argument, malformed/empty/partial backend outputs,
  warning-only operator completion, `projection_pending` without false success,
  and stale Text data-block invalidation.
- Packaging smoke extracts the backend ZIP outside the checkout, clears
  inherited `PYTHONPATH`, runs `python -m blueprints_backend` from the extracted
  backend root, and validates its three declared outputs.
- Blender bridge smoke behavior through `npm run test:blender` when Blender 5.1
  is available locally or `BLENDER_EXE` points to Blender 5.1.
- The Blender 5.1 smoke includes both source and installed-package cases. Its
  blank-configuration case enables the real installed add-on with default
  preferences and requires `backend_not_configured`, `CANCELLED`, and zero
  job/export side effects. Its configured case extracts the backend ZIP, sets
  Backend Source to the folder containing `blueprints_backend`, runs the real
  operator to completion, and requires diagnostics plus raw SVG source in the
  compatible `Blueprints SVG Preview` Text block. The expected
  `projection_pending` result is a warning and never `Blueprint generated`.

`codex:ship` remains CI-safe and does not load Blender. The explicit
`test:blender` command loads Blender 5.1 in background mode for bridge
changes. `test:blender -- --if-available` is reserved for PostToolUse and emits
`[DEFER]` with exit 0 only when `BLENDER_EXE` is unset and Blender 5.1 cannot be
auto-discovered. An explicit missing, unlaunchable, or wrong-version executable
always fails. `test:packaging` packages the add-on and backend only inside a
temporary directory and does not commit generated artifacts. The gates do not
run a browser, compile an executable, build installers, invoke
FreeCAD/TechDraw, or generate committed product artifacts.
