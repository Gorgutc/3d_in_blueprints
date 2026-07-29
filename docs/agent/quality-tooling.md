# Quality Tooling

The quality layer is local and fail-closed. It verifies the implemented product
contracts without making Node part of the product runtime.

## Tool Map

- `scripts/verify-codex-plugin.mjs`: validates marketplace, plugin manifest,
  skills, frontmatter, and agent metadata.
- `scripts/check-governance.mjs`: blocks stale active instructions and profile
  drift.
- `scripts/check-js-syntax.mjs`: fail-closed discovery of the required `scripts`
  and `.codex/hooks` roots followed by deterministic `node --check` execution.
- `scripts/run-python-tests.mjs`: owns the exact backend and add-on Python test
  module inventory, validates it before interpreter discovery, and then runs
  the two stdlib `unittest` discovery suites for backend, GOST composer,
  Dimensions v1, Standards DB v1, Image Assist v1, release packaging behavior,
  and bridge unit tests.
- `scripts/lib/python-resolver.mjs`: import-safe owner for bounded Python
  interpreter launchability discovery shared by the backend-test, packaging,
  and Blender-smoke runners.
- `scripts/run-blender-smoke.mjs`: resolves Blender 5.1 and runs full source plus
  installed two-ZIP bridge smoke in background mode. On Windows it discovers
  candidates from `ProgramFiles` and `ProgramW6432`, including non-`C:` roots,
  before the PATH fallback. Normal invocation is strict; `--if-available` is
  the conditional PostToolUse mode.
- `scripts/package_release.py`: creates version-stamped add-on and backend zip
  artifacts plus a release manifest using Python stdlib only.
- `scripts/run-packaging-smoke.mjs`: resolves Python and runs packaging into a
  temporary directory, verifying required zip contents and artifact policy.
- `scripts/verify-codex-infra.mjs`: validates required docs, hooks, agents,
  CI, authority contracts, and executable context-hook semantics.
- `lefthook.yml`: optional local pre-commit and pre-push quality gates.
- `npm run hooks:install`: thin CLI over the import-safe native-hook installer
  core. It installs the same gates only after Git-path, ownership, transaction,
  and read-back checks succeed.
- `.codex/hooks/post-tool-verify.js`: structurally classifies changed paths,
  runs `quality:deep` for governed changes, and then conditionally runs Blender
  for Blender-sensitive changes.
- `.github/workflows/codex-infra.yml`: CI gate for npm install and ship checks.

`docs/handoff/ITERATION_LOG.md` is a historical handoff ledger, not an active
policy source. It can preserve command output counts as evidence and is not part
of stale-total governance scanning.

## Context Hook Contract

`SessionStart` emits one deterministic JSON envelope with the approved current
repository context: `AGENTS.md` authority, selected product scope, active and
dormant profiles, broad-work subagents, `codex:ship`, and review/fallback.

A triggered `UserPromptSubmit` emits the narrower approved reminder subset:
`AGENTS.md`, the selected Blender add-on plus backend scope, broad-work
subagents, `codex:ship`, and review/fallback. It does not repeat profile state.
The first truthy `prompt || user_prompt` value remains authoritative; a selected
non-string value is a controlled no-op. Malformed JSON retains raw-text
fallback, and matching retains case-insensitive substring behavior. Every
non-triggered or selected non-string input exits successfully with empty stdout
and stderr. Hook context remains subordinate to the current user request under
the repository authority order; the reminder cannot override an explicit scope
decision.

Infra verification executes both hook entrypoints with bounded child processes,
checks exact JSON envelopes and context, and applies negative semantic mutants.
The verifier owns an independent projection of the approved output; runtime
hooks do not import their expected text from the verifier.

## Native Git Hook Installer Contract

The ordered contract is exactly `pre-commit -> npm run quality:fast` followed
by `pre-push -> npm run codex:ship`. The CLI name remains `hooks:install`; the
import-safe core lives in `scripts/lib/native-hook-installer.mjs`, so tests
never need to import or execute the live CLI entrypoint.

The installer first proves that `git rev-parse --show-toplevel` matches its
intended repository root. Git remains the active-path authority through
`git rev-parse --path-format=absolute --git-path hooks`; a separate lexical
`git rev-parse --git-path hooks` probe detects redirects that Git for Windows
may canonicalize. Default shared hooks in linked worktrees and configured
relative or absolute `core.hooksPath` locations are supported because Git
selected them. A lexical/active mismatch, symlink, junction, other reparse
redirect, non-directory path, non-regular target, or multiply linked target is
rejected before mutation.

Both targets receive a complete preflight before any directory or file is
created. Only an absent target, the exact current managed body, or the exact
legacy body is adoptable; a marker embedded in another body is unmanaged. The
installer stages both bodies with exclusive same-directory files, reads the
stages back, re-resolves the active Git path, applies both targets, sets the
executable intent, and reads both final bodies back. Success lines, including
the actual active hooks directory, are buffered until every check passes.

Handled mkdir, write, chmod, rename, and read-back failures trigger reverse
rollback of exact prior bytes and modes plus owned temporary-directory cleanup.
This is a handled-failure transaction, not a claim of two-file crash or
power-loss atomicity. If rollback itself fails, the command remains failed and
preserves any verified recovery candidate rather than deleting the last
restorable copy. Unverified or corrupt candidates are cleanup targets and are
never advertised as recovery paths.

## Python Test Inventory Contract

`scripts/run-python-tests.mjs` is the single production owner for the exact,
ordered `test_*.py` module allowlist under `backend/tests` and
`blender_addon/tests`. The runner recursively derives slash-normalized paths
from directory entries, requires a nonzero inventory in each root, and compares
the deterministic result with that allowlist before probing any Python
interpreter or starting either suite.

Missing, duplicate, renamed, case-aliased, or additive test modules fail
closed. Missing, mis-cased, unreadable, escaped, symlinked, junction-backed, or
non-directory roots; symlink/junction entries; non-regular allowlisted module
paths; unsupported filesystem entry types; nested discovery package markers;
and empty inventories are also controlled failures. The separate
`smoke_blender_*.py` scripts belong to `test:blender` and are deliberately not
part of this `test:backend` module contract.
Non-`test_*.py` fixtures and the standalone `npm run test:packaging` release
smoke are also outside the inventory; `backend/tests/test_packaging.py` remains
an allowlisted `test:backend` module and covers different behavior.

Infra verification imports the production inspector and runner without CLI
side effects, compares their immutable contract with an independent oracle,
and executes isolated filesystem mutants. Every allowlisted-module deletion
must fail before any interpreter probe or unittest subprocess; additive,
duplicate, renamed, nested, case, zero-inventory, path, type, and
filesystem-error mutants are covered as well. The contract fixes module
composition, not the number of test methods, passes, or skips.

## Python Interpreter Discovery Contract

Exactly three runners use `scripts/lib/python-resolver.mjs` to find a
launchable interpreter: `run-python-tests.mjs`, `run-packaging-smoke.mjs`, and
`run-blender-smoke.mjs`. Candidate order remains a truthy raw `PYTHON` value,
`python3`, `python`, `py -3`, and then the existing bundled Codex runtime under
`USERPROFILE || HOME`. An invalid explicit `PYTHON` value falls through to the
next candidate; it is not a strict override.

Every `--version` probe is a direct no-shell process with a 30-second timeout.
A thrown spawn, process error or timeout, signal, missing status, or nonzero
status rejects only that candidate and continues discovery. The first clean
status `0` wins, including arbitrary or empty version output. This bounded
slice verifies launchability only: it does not declare a supported Python
version, parse version output, add a capability requirement, or change the
timeouts of the actual unittest and packaging commands.

The resolver remains Node verification infrastructure, not product runtime.
Its path is Blender-sensitive for PostToolUse because it also selects the
interpreter used to build the isolated two-ZIP Blender smoke artifacts.

## Command Groups

- `quality:fast`: plugin, governance, JS syntax, and infra verification.
- `test:backend`: Python stdlib tests for backend, GOST composer, Dimensions
  v1, Standards DB v1, Image Assist v1, release packaging behavior, and bridge
  unit behavior.
- `test:blender`: strict Blender 5.1 source plus installed-package smoke;
  `--if-available` may defer only when every auto-discovery route is genuinely
  missing. Wrong-version, unlaunchable, or unreadable auto-discovery results
  remain failures unless a later valid Blender 5.1 candidate succeeds.
- `test:packaging`: stdlib packaging smoke that writes generated release
  artifacts only to a temporary directory.
- `quality:deep`: `quality:fast` plus backend, bridge unit, and packaging
  smoke tests.
- `codex:ship`: required final local gate before commit, push, PR, or delivery.

`quality:deep`, `codex:ship`, and CI remain Blender-free. The conditional
PostToolUse Blender route starts only after `quality:deep` succeeds.
