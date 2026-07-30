import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkJavaScriptFiles,
  collectJavaScriptFiles,
} from './lib/js-syntax-checker.mjs';
import {
  executeVerificationPlan,
  planPostToolVerification,
} from './lib/post-tool-routing.mjs';
import { resolvePython } from './lib/python-resolver.mjs';
import {
  main as runBlenderSmokeMain,
  parseSmokeArguments,
  probeBlender,
  resolveBlender,
  runReleaseArtifactBuild,
} from './run-blender-smoke.mjs';
import {
  NATIVE_HOOKS,
  hookBody as nativeHookBody,
  installNativeHooks as installNativeHooksCore,
  legacyHookBody as legacyNativeHookBody,
  main as installNativeHooksCoreMain,
  resolveActiveHooksDirectory as resolveActiveHooksDirectoryCore,
} from './lib/native-hook-installer.mjs';
import {
  PYTHON_TEST_MODULES,
  PYTHON_TEST_ROOTS,
  inspectPythonTestInventory,
  main as runPythonTestsMain,
} from './run-python-tests.mjs';
import { main as runPackagingSmokeMain } from './run-packaging-smoke.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const checks = [];
const frozenLiveAssertionIds = new Set();
const nativeHookFixtureContexts = new Map();

const requiredFiles = [
  'AGENTS.md',
  '.gitignore',
  'CLAUDE.md',
  'GEMINI.md',
  'DO_NOT_PUSH.md',
  '.codex/config.toml',
  '.codex/hooks.json',
  '.codex/hooks/session-start.js',
  '.codex/hooks/user-prompt-nudge.js',
  '.codex/hooks/post-tool-verify.js',
  '.agents/plugins/marketplace.json',
  'plugins/blueprints-codex/.codex-plugin/plugin.json',
  'docs/agent/bootstrap.md',
  'docs/agent/orchestration.md',
  'docs/agent/verification.md',
  'docs/agent/quality-tooling.md',
  'docs/agent/code_review.md',
  'docs/agent/archive_policy.md',
  'docs/agent/frozen-decisions.md',
  'docs/agent/skill-map.md',
  'docs/agent/migration-inventory.md',
  'docs/release/packaging.md',
  'docs/agent/profiles/windows-exe.md',
  'docs/agent/profiles/blender-addon.md',
  'docs/agent/adrs/0001-codex-infrastructure.md',
  'docs/agent/adrs/0002-dormant-product-profiles.md',
  'docs/agent/adrs/0003-blender-addon-backend-activation.md',
  'docs/agent/evals/README.md',
  'docs/handoff/ITERATION_LOG.md',
  '.github/workflows/codex-infra.yml',
  'lefthook.yml',
  'package.json',
  'package-lock.json',
  'scripts/verify-codex-plugin.mjs',
  'scripts/check-governance.mjs',
  'scripts/check-js-syntax.mjs',
  'scripts/lib/js-syntax-checker.mjs',
  'scripts/lib/native-hook-installer.mjs',
  'scripts/lib/post-tool-routing.mjs',
  'scripts/lib/python-resolver.mjs',
  'scripts/verify-codex-infra.mjs',
  'scripts/verify-codex-infra/context-hooks.mjs',
  'scripts/run-python-tests.mjs',
  'scripts/run-blender-smoke.mjs',
  'scripts/run-packaging-smoke.mjs',
  'scripts/package_release.py',
  'scripts/install-hooks.mjs',
  'backend/src/blueprints_backend/svg_ids.py',
  'backend/src/blueprints_backend/gost.py',
  'backend/src/blueprints_backend/dimensions.py',
  'backend/src/blueprints_backend/standards.py',
  'backend/src/blueprints_backend/image_assist.py',
  'backend/src/blueprints_backend/job.py',
  'backend/src/blueprints_backend/data/standards_fasteners.json',
  'backend/tests/fixtures/gost_job.json',
  'backend/tests/fixtures/golden_gost_a4.svg',
  'backend/tests/fixtures/dimensions_job.json',
  'backend/tests/fixtures/golden_dimensions_a4.svg',
  'backend/tests/fixtures/standards_job.json',
  'backend/tests/fixtures/image_assist_job.json',
  'backend/tests/fixtures/golden_image_assist_overlay.svg',
  'backend/tests/test_packaging.py',
  'blender_addon/blueprints_addon/__init__.py',
  'blender_addon/blueprints_addon/bridge.py',
  'blender_addon/blueprints_addon/preview.py',
  'blender_addon/tests/test_bridge_unit.py',
  'blender_addon/tests/smoke_blender_bridge.py',
  'blender_addon/tests/smoke_blender_packaged.py',
];

const requiredAgents = [
  'codex_infra_architect',
  'instruction_drift_auditor',
  'tech_stack_cartographer',
  'quality_tooling_architect',
  'verification_reviewer',
  'code_quality_guardian',
  'code_deadwood_auditor',
  'component_reuse_guardian',
  'runtime_behavior_mapper',
  'frozen_decisions_guardian',
  'visual_qa_guardian',
  'windows_packaging_guardian',
  'blender_addon_guardian',
];

const expectedPackageScripts = Object.freeze({
  'codex:verify-plugin': 'node scripts/verify-codex-plugin.mjs',
  'check:governance': 'node scripts/check-governance.mjs',
  'check:js': 'node scripts/check-js-syntax.mjs',
  'test:backend': 'node scripts/run-python-tests.mjs',
  'test:blender': 'node scripts/run-blender-smoke.mjs',
  'test:packaging': 'node scripts/run-packaging-smoke.mjs',
  verify: 'node scripts/verify-codex-infra.mjs',
  'quality:fast': 'npm run codex:verify-plugin && npm run check:governance && npm run check:js && npm run verify',
  'quality:deep': 'npm run quality:fast && npm run test:backend && npm run test:packaging',
  'codex:ship': 'npm run quality:deep',
  'hooks:install': 'node scripts/install-hooks.mjs',
});

const expectedHooks = Object.freeze({
  hooks: {
    SessionStart: [{
      matcher: 'startup|resume',
      hooks: [{
        type: 'command',
        command: 'node "$(git rev-parse --show-toplevel)/.codex/hooks/session-start.js"',
        commandWindows: 'powershell.exe -NoProfile -Command "node (Join-Path (git rev-parse --show-toplevel) \'.codex/hooks/session-start.js\')"',
        timeout: 5,
        statusMessage: 'Loading 3d_in_blueprints Codex context',
      }],
    }],
    UserPromptSubmit: [{
      hooks: [{
        type: 'command',
        command: 'node "$(git rev-parse --show-toplevel)/.codex/hooks/user-prompt-nudge.js"',
        commandWindows: 'powershell.exe -NoProfile -Command "node (Join-Path (git rev-parse --show-toplevel) \'.codex/hooks/user-prompt-nudge.js\')"',
        timeout: 5,
      }],
    }],
    PostToolUse: [{
      matcher: 'apply_patch|Edit|Write|MultiEdit',
      hooks: [{
        type: 'command',
        command: 'node "$(git rev-parse --show-toplevel)/.codex/hooks/post-tool-verify.js"',
        commandWindows: 'powershell.exe -NoProfile -Command "node (Join-Path (git rev-parse --show-toplevel) \'.codex/hooks/post-tool-verify.js\')"',
        timeout: 600,
        statusMessage: 'Running Codex quality:deep and conditional Blender verification',
      }],
    }],
  },
});

const expectedFrozenDecisions = Object.freeze([
  ['FD-001', 'Product scope is selected: Blender add-on + local standalone backend.'],
  ['FD-002', 'Node tooling is a verification command harness, not the product runtime.'],
  ['FD-003', '`blender-addon` profile is active; `windows-exe` profile is dormant.'],
  ['FD-004', 'Blender baseline is Blender 5.1.'],
  ['FD-005', 'Backend strategy is Python-first with FreeCAD/TechDraw as the MVP geometry provider.'],
  ['FD-006', 'OCCT/C++ is deferred until profiling proves it is needed.'],
  ['FD-007', 'Add-on/backend transport is subprocess + job folder.'],
  ['FD-008', 'Canonical drawing output is SVG. DXF and PDF are derived formats. DWG is not core v1.'],
  ['FD-009', 'GPL-sensitive dependencies are allowed only across a separate process/distribution boundary.'],
  ['FD-010', 'Source repository rules are source material, not active policy.'],
  ['FD-011', 'Every repo-local skill has `SKILL.md` and `agents/openai.yaml`.'],
  ['FD-012', 'Every `.codex/agents/*.toml` role returns PASS/FAIL with evidence.'],
  ['FD-013', '`npm run codex:ship` is required before delivery.'],
  ['FD-014', 'Final closeout includes `/review` or an explicitly labeled fallback review.'],
]);

const expectedLefthook = `pre-commit:
  parallel: false
  commands:
    quality-fast:
      run: npm run quality:fast

pre-push:
  parallel: false
  commands:
    codex-ship:
      run: npm run codex:ship
`;

const expectedNativeHooks = Object.freeze([
  Object.freeze({ name: 'pre-commit', command: 'npm run quality:fast' }),
  Object.freeze({ name: 'pre-push', command: 'npm run codex:ship' }),
]);

const expectedWorkflow = [
  'name: Codex Infrastructure',
  '',
  'on:',
  '  pull_request:',
  '  push:',
  '    branches:',
  '      - main',
  '',
  'jobs:',
  '  codex-infra:',
  '    strategy:',
  '      fail-fast: false',
  '      matrix:',
  '        os: [ubuntu-latest, windows-latest]',
  '    runs-on: ${{ matrix.os }}',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: actions/setup-node@v4',
  '        with:',
  "          node-version: '22'",
  '          cache: npm',
  '      - uses: actions/setup-python@v5',
  '        with:',
  "          python-version: '3.12'",
  '      - run: npm ci',
  '      - run: npm run codex:ship',
  '',
].join('\n');

const expectedCompatibilityPointers = Object.freeze({
  'CLAUDE.md': [
    '# CLAUDE.md',
    '',
    'Use `AGENTS.md` as the source of truth for this repository.',
    '',
    'This file is a compatibility pointer only. Do not add separate Claude-specific',
    'policy here.',
    '',
  ].join('\n'),
  'GEMINI.md': [
    '# GEMINI.md',
    '',
    'Use `AGENTS.md` as the source of truth for this repository.',
    '',
    'This file is a compatibility pointer only. Do not add separate Gemini-specific',
    'policy here.',
    '',
  ].join('\n'),
});

function exists(rel) {
  return existsSync(path.join(root, rel));
}

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function check(name, condition, detail = '') {
  checks.push({ name, condition: Boolean(condition), detail });
}

const contextHookModuleRelativePath = 'scripts/verify-codex-infra/context-hooks.mjs';

function contextHookModuleSourceContract(source, expectedDigest) {
  const value = String(source);
  const normalizedSource = value.replace(/\r\n/g, '\n');
  const digest = createHash('sha256').update(normalizedSource).digest('hex').toUpperCase();
  const errors = [];
  if (value.startsWith('\uFEFF')) errors.push('module source must not start with a BOM');
  if (digest !== expectedDigest) errors.push(`normalized sha256=${digest}; expected=${expectedDigest}`);
  return Object.freeze({ digest, errors: Object.freeze(errors) });
}

function contextHookModuleSnapshotUrlForSource(source) {
  return `data:text/javascript;base64,${Buffer.from(String(source), 'utf8').toString('base64')}`;
}

function contextHookModuleSnapshotUrlMatchesSource(snapshotUrl, source) {
  const prefix = 'data:text/javascript;base64,';
  return typeof snapshotUrl === 'string'
    && snapshotUrl.startsWith(prefix)
    && Buffer.from(snapshotUrl.slice(prefix.length), 'base64').toString('utf8') === String(source);
}

function contextHookImportProbeIsSafe(result, sentinel) {
  return result?.status === 0
    && result.signal === null
    && !result.error
    && result.stdout === sentinel
    && result.stderr === '';
}

function contextHookModuleExportContractErrors(moduleNamespace) {
  const errors = [];
  if (!moduleNamespace || (typeof moduleNamespace !== 'object' && typeof moduleNamespace !== 'function')) {
    return ['module namespace must be an object'];
  }

  const exportNames = Object.keys(moduleNamespace).sort();
  if (JSON.stringify(exportNames) !== JSON.stringify(['registerContextHookChecks'])) {
    errors.push(`exports=${exportNames.join(',') || '<none>'}`);
  }
  if (typeof moduleNamespace.registerContextHookChecks !== 'function') {
    errors.push('registerContextHookChecks must be a function');
  }
  return errors;
}

function contextHookRegistrationInvocationErrors(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return ['registration invocation result must be an object'];
  }

  const errors = [];
  if (
    JSON.stringify(Object.keys(result).sort())
      !== JSON.stringify(['arity', 'calls', 'error', 'returnValue', 'threw'])
  ) {
    errors.push('registration invocation result has an invalid shape');
  }
  if (result.calls !== 1) errors.push(`calls=${result.calls}`);
  if (result.arity !== 1) errors.push(`arity=${result.arity}`);
  if (result.returnValue !== undefined) errors.push('registration must return undefined synchronously');
  if (typeof result.threw !== 'boolean') errors.push('threw must be a boolean');
  if (result.threw === true) errors.push(`registration threw: ${errorDetailForCheck(result.error)}`);
  if (result.threw === false && result.error !== null) errors.push('non-null error without a throw');
  return errors;
}

function contextHookRegistrationExpectation(names) {
  return Object.freeze({
    count: names.length,
    digest: createHash('sha256').update(names.join('\n')).digest('hex').toUpperCase(),
    first: names.at(0),
    last: names.at(-1),
  });
}

function contextHookRegistrationValidationErrors(records, expected) {
  const errors = [];
  if (!Array.isArray(records)) return ['registration records must be an array'];

  const names = [];
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`record ${index} must be an object`);
      continue;
    }
    if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['condition', 'detail', 'name'])) {
      errors.push(`record ${index} has an invalid shape`);
      continue;
    }
    if (typeof record.name !== 'string' || record.name.length === 0) {
      errors.push(`record ${index} has an invalid name`);
    } else {
      names.push(record.name);
    }
    if (typeof record.condition !== 'boolean') errors.push(`record ${index} has a non-boolean condition`);
    if (typeof record.detail !== 'string') errors.push(`record ${index} has a non-string detail`);
  }

  if (new Set(names).size !== names.length) errors.push('registration records contain duplicate names');
  if (records.length !== expected.count) {
    errors.push(`registered ${records.length} checks; expected ${expected.count}`);
    return errors;
  }

  const actualDigest = createHash('sha256').update(names.join('\n')).digest('hex').toUpperCase();
  if (names.at(0) !== expected.first) errors.push(`first=${names.at(0) || '<none>'}`);
  if (names.at(-1) !== expected.last) errors.push(`last=${names.at(-1) || '<none>'}`);
  if (actualDigest !== expected.digest) errors.push(`sha256=${actualDigest}`);
  return errors;
}

function checkFrozenLive(id, name, condition, detail = '') {
  frozenLiveAssertionIds.add(id);
  check(`${id} live assertion: ${name}`, condition, detail);
}

function tomlField(body, name) {
  const match = new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm').exec(body);
  return match?.[1] || '';
}

function profileBlock(config, profileName) {
  return config
    .split(/\r?\n(?=\[\[profiles\]\])/)
    .find((block) => new RegExp(`^name\\s*=\\s*"${profileName}"`, 'm').test(block)) || '';
}

function profileProjectionErrors({ agents, blenderDoc, config, readme, windowsDoc }) {
  const errors = [];
  const currentBlenderDoc = blenderDoc.split('## Historical Iteration Contracts')[0];
  const blenderDocStatuses = [...currentBlenderDoc.matchAll(/^Status:\s*([^\r\n]+)$/gm)].map((match) => match[1]);
  const windowsDocStatuses = [...windowsDoc.matchAll(/^Status:\s*([^\r\n]+)$/gm)].map((match) => match[1]);
  const blenderStatuses = [...profileBlock(config, 'blender-addon').matchAll(/^status\s*=\s*"([^"]+)"\s*$/gm)].map((match) => match[1]);
  const windowsStatuses = [...profileBlock(config, 'windows-exe').matchAll(/^status\s*=\s*"([^"]+)"\s*$/gm)].map((match) => match[1]);
  if (JSON.stringify(blenderStatuses) !== JSON.stringify(['active'])) errors.push('config blender-addon status differs');
  if (JSON.stringify(windowsStatuses) !== JSON.stringify(['dormant'])) errors.push('config windows-exe status differs');
  if (matchCount(agents, /`blender-addon` profile is active/g) !== 1 || hasProfileStateClaim(agents, 'blender-addon', 'dormant')) errors.push('AGENTS blender-addon status differs');
  if (matchCount(agents, /`windows-exe` profile remains dormant/g) !== 1 || hasProfileStateClaim(agents, 'windows-exe', 'active')) errors.push('AGENTS windows-exe status differs');
  if (matchCount(readme, /^- Active profile: `blender-addon`\.$/gm) !== 1 || hasProfileStateClaim(readme, 'blender-addon', 'dormant')) errors.push('README blender-addon status differs');
  if (matchCount(readme, /^- Dormant profile: `windows-exe`\./gm) !== 1 || hasProfileStateClaim(readme, 'windows-exe', 'active')) errors.push('README windows-exe status differs');
  if (JSON.stringify(blenderDocStatuses) !== JSON.stringify(['active.']) || hasProfileStateClaim(currentBlenderDoc, 'blender-addon', 'dormant') || hasImplicitProfileStateClaim(currentBlenderDoc, 'dormant')) errors.push('Blender profile doc status differs');
  if (JSON.stringify(windowsDocStatuses) !== JSON.stringify(['dormant.']) || hasProfileStateClaim(windowsDoc, 'windows-exe', 'active') || hasImplicitProfileStateClaim(windowsDoc, 'active')) errors.push('Windows profile doc status differs');
  return errors;
}

function hasProfileStateClaim(source, profileName, state) {
  const escapedName = profileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const profilePattern = new RegExp(`(?:^|[^A-Za-z0-9_-])\`?${escapedName}\`?(?=$|[^A-Za-z0-9_-])`, 'i');
  const statePattern = new RegExp(`\\b${state}\\b`, 'i');
  return profileClaimUnits(source).some((unit) => (
    profilePattern.test(unit)
      && /\b(?:profile|status)\b/i.test(unit)
      && statePattern.test(unit)
  ));
}

function hasImplicitProfileStateClaim(source, state) {
  const statePattern = new RegExp(`\\b${state}\\b`, 'i');
  return profileClaimUnits(source).some((unit) => (
    !hasKnownProfileId(unit)
      && /\b(?:profile|status)\b/i.test(unit)
      && statePattern.test(unit)
  ));
}

function profileClaimUnits(source) {
  return source
    .replace(/\r?\n\s*\r?\n/g, '. ')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?:[.!?;]+|\b(?:and|but|while|whereas)\b)/i)
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function hasKnownProfileId(source) {
  return ['blender-addon', 'windows-exe'].some((profileName) => {
    const escapedName = profileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^A-Za-z0-9_-])\`?${escapedName}\`?(?=$|[^A-Za-z0-9_-])`, 'i').test(source);
  });
}

function matchCount(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function packageScriptErrors(scripts) {
  const errors = [];
  const actualKeys = Object.keys(scripts).sort();
  const expectedKeys = Object.keys(expectedPackageScripts).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    errors.push(`script keys differ: ${actualKeys.join(', ')}`);
  }
  for (const [name, expected] of Object.entries(expectedPackageScripts)) {
    if (scripts[name] !== expected) errors.push(`${name} differs`);
  }

  const references = new Map();
  for (const [name, command] of Object.entries(scripts)) {
    const refs = [...String(command).matchAll(/\bnpm run ([\w:-]+)/g)].map((match) => match[1]);
    references.set(name, refs);
    for (const ref of refs) {
      if (!Object.hasOwn(scripts, ref)) errors.push(`${name} references missing script ${ref}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(name, chain = []) {
    if (visiting.has(name)) {
      errors.push(`script cycle: ${[...chain, name].join(' -> ')}`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const ref of references.get(name) || []) visit(ref, [...chain, name]);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of Object.keys(scripts)) visit(name);
  return [...new Set(errors)];
}

function workflowErrors(workflow) {
  const errors = [];
  const normalized = workflow.replace(/\r\n/g, '\n');
  if (normalized !== expectedWorkflow) errors.push('CI workflow differs from the exact approved document');
  const steps = [...workflow.matchAll(/^      - (uses|run):\s*(.+?)\s*$/gm)]
    .map((match) => `${match[1]}:${match[2]}`);
  const expectedSteps = [
    'uses:actions/checkout@v4',
    'uses:actions/setup-node@v4',
    'uses:actions/setup-python@v5',
    'run:npm ci',
    'run:npm run codex:ship',
  ];
  if (JSON.stringify(steps) !== JSON.stringify(expectedSteps)) errors.push(`CI steps differ: ${steps.join(', ')}`);
  const matrix = /os:\s*\[([^\]]+)\]/.exec(workflow)?.[1]
    ?.split(',').map((value) => value.trim()) || [];
  if (JSON.stringify(matrix) !== JSON.stringify(['ubuntu-latest', 'windows-latest'])) {
    errors.push(`CI matrix differs: ${matrix.join(', ')}`);
  }
  if (!/^on:\s*\r?\n\s{2}pull_request:\s*\r?\n\s{2}push:/m.test(workflow)) errors.push('CI triggers differ');
  if (!/branches:\s*\r?\n\s*- main/.test(workflow)) errors.push('CI push branch differs');
  if (!/fail-fast:\s*false/.test(workflow)) errors.push('CI fail-fast must be false');
  if (!/node-version:\s*'22'/.test(workflow) || !/cache:\s*npm/.test(workflow)) errors.push('CI Node setup differs');
  if (!/python-version:\s*'3\.12'/.test(workflow)) errors.push('CI Python setup differs');
  if (/continue-on-error:/.test(workflow)) errors.push('CI must not use continue-on-error');
  if (/test:blender|\bblender\b/i.test(workflow)) errors.push('CI must remain Blender-free');
  const jobsSection = /^jobs:\s*\r?\n([\s\S]*)$/m.exec(workflow)?.[1] || '';
  const jobNames = [...jobsSection.matchAll(/^  ([\w-]+):\s*$/gm)].map((match) => match[1]);
  if (JSON.stringify(jobNames) !== JSON.stringify(['codex-infra'])) errors.push(`CI jobs differ: ${jobNames.join(', ')}`);
  return errors;
}

function workflowInventoryErrors(inventory) {
  const normalized = [...inventory].sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ));
  const expected = [{ name: 'codex-infra.yml', type: 'file' }];
  return JSON.stringify(normalized) === JSON.stringify(expected)
    ? []
    : [`CI workflow inventory differs: ${normalized.map((entry) => `${entry.name}:${entry.type}`).join(', ')}`];
}

function hookConfigErrors(config) {
  return JSON.stringify(config) === JSON.stringify(expectedHooks)
    ? []
    : ['.codex/hooks.json differs from the approved exact topology'];
}

function nativeHookContractErrors(hooks) {
  const entries = Array.isArray(hooks)
    ? hooks.map((entry) => ({ name: entry?.name, command: entry?.command }))
    : [];
  return JSON.stringify(entries) === JSON.stringify(expectedNativeHooks)
    ? []
    : [`native Git hook contract differs: ${JSON.stringify(entries)}`];
}

function expectedNativeHookBody(command, { legacy = false } = {}) {
  return [
    '#!/bin/sh',
    ...(!legacy ? ['# managed-by: 3d_in_blueprints-codex-infra'] : []),
    'set -eu',
    'repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"',
    'cd "$repo_root"',
    command,
    '',
  ].join('\n');
}

function nativeInstallerFs(overrides = {}) {
  return {
    chmodSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    renameSync,
    rmdirSync,
    unlinkSync,
    writeFileSync,
    ...overrides,
  };
}

function createIsolatedFixtureGitContext(container, baseEnv = process.env) {
  const canonicalContainer = canonicalFixturePath(container);
  const globalConfig = path.join(canonicalContainer, 'isolated-global.gitconfig');
  const templateDir = path.join(canonicalContainer, 'isolated-template');
  writeFileSync(globalConfig, '', { encoding: 'utf8', flag: 'wx' });
  mkdirSync(templateDir);

  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (
      [
        'GCM_INTERACTIVE',
        'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        'GIT_CEILING_DIRECTORIES',
        'GIT_COMMON_DIR',
        'GIT_CONFIG',
        'GIT_CONFIG_COUNT',
        'GIT_CONFIG_GLOBAL',
        'GIT_CONFIG_NOSYSTEM',
        'GIT_CONFIG_PARAMETERS',
        'GIT_CONFIG_SYSTEM',
        'GIT_DIR',
        'GIT_DISCOVERY_ACROSS_FILESYSTEM',
        'GIT_GRAFT_FILE',
        'GIT_INDEX_FILE',
        'GIT_NAMESPACE',
        'GIT_OBJECT_DIRECTORY',
        'GIT_QUARANTINE_PATH',
        'GIT_REPLACE_REF_BASE',
        'GIT_SHALLOW_FILE',
        'GIT_TEMPLATE_DIR',
        'GIT_TERMINAL_PROMPT',
        'GIT_WORK_TREE',
      ].includes(upper)
      || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(upper)
    ) {
      delete env[key];
    }
  }
  env.GCM_INTERACTIVE = 'Never';
  env.GIT_CONFIG_COUNT = '0';
  env.GIT_CONFIG_GLOBAL = globalConfig;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_TEMPLATE_DIR = templateDir;
  env.GIT_TERMINAL_PROMPT = '0';
  return Object.freeze({
    container: canonicalContainer,
    env: Object.freeze(env),
  });
}

function canonicalFixturePath(candidate, {
  pathApi = path,
  realpathNative = realpathSync.native,
} = {}) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new TypeError('fixture path must be a non-empty string');
  }

  let existingAncestor = pathApi.resolve(candidate);
  const missingTail = [];
  while (true) {
    try {
      const canonicalAncestor = pathApi.resolve(realpathNative(existingAncestor));
      return missingTail.length === 0
        ? canonicalAncestor
        : pathApi.join(canonicalAncestor, ...missingTail);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = pathApi.dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      missingTail.unshift(pathApi.basename(existingAncestor));
      existingAncestor = parent;
    }
  }
}

function fixturePathIsConfined(container, candidate, canonicalOptions = {}) {
  const pathApi = canonicalOptions.pathApi ?? path;
  const canonicalContainer = canonicalFixturePath(container, canonicalOptions);
  const canonicalCandidate = canonicalFixturePath(candidate, canonicalOptions);
  const relative = pathApi.relative(canonicalContainer, canonicalCandidate);
  return relative === ''
    || (
      relative !== '..'
      && !relative.startsWith(`..${pathApi.sep}`)
      && !pathApi.isAbsolute(relative)
    );
}

function fixtureContextForPath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  const resolved = canonicalFixturePath(candidate);
  let selected = null;
  for (const context of nativeHookFixtureContexts.values()) {
    if (
      fixturePathIsConfined(context.container, resolved)
      && (!selected || context.container.length > selected.container.length)
    ) {
      selected = context;
    }
  }
  return selected;
}

function normalizedGitFixturePath(rawValue) {
  let value = Buffer.isBuffer(rawValue) ? rawValue.toString('utf8') : String(rawValue || '');
  if (value.endsWith('\r\n')) value = value.slice(0, -2);
  else if (value.endsWith('\n')) value = value.slice(0, -1);
  if (value.length === 0 || /[\r\n\0]/.test(value)) {
    throw new Error('fixture Git hooks lookup returned an invalid path');
  }
  if (process.platform === 'win32') value = value.replace(/^\/([A-Za-z]:[\\/])/, '$1');
  return path.resolve(value);
}

function assertFixtureHooksPathConfined(context, rawPath) {
  const candidate = normalizedGitFixturePath(rawPath);
  if (!fixturePathIsConfined(context.container, candidate)) {
    throw new Error(`fixture Git hooks path escaped its container: ${candidate}`);
  }
  return canonicalFixturePath(candidate);
}

function nativeHookFixtureSpawn(rootPath) {
  const context = fixtureContextForPath(rootPath);
  if (!context) return spawnSync;
  return (command, args, options = {}) => {
    const result = spawnSync(command, args, { ...options, env: context.env });
    if (
      command === 'git'
      && JSON.stringify(args) === JSON.stringify([
        'rev-parse', '--path-format=absolute', '--git-path', 'hooks',
      ])
      && !result.error
      && result.signal === null
      && result.status === 0
    ) {
      assertFixtureHooksPathConfined(context, result.stdout);
    }
    return result;
  };
}

function resolveActiveHooksDirectory(options = {}) {
  return resolveActiveHooksDirectoryCore({
    ...options,
    spawn: options.spawn ?? nativeHookFixtureSpawn(options.root),
  });
}

function installNativeHooks(options = {}) {
  return installNativeHooksCore({
    ...options,
    spawn: options.spawn ?? nativeHookFixtureSpawn(options.root),
  });
}

function installNativeHooksMain(options = {}) {
  return installNativeHooksCoreMain({
    ...options,
    spawn: options.spawn ?? nativeHookFixtureSpawn(options.root),
  });
}

function createNativeHookFixture(label, { baseEnvFactory = null } = {}) {
  const canonicalTempRoot = canonicalFixturePath(tmpdir());
  const container = canonicalFixturePath(
    mkdtempSync(path.join(canonicalTempRoot, 'blueprints-native-hooks-')),
  );
  try {
    const baseEnv = baseEnvFactory ? baseEnvFactory(container) : process.env;
    const context = createIsolatedFixtureGitContext(container, baseEnv);
    nativeHookFixtureContexts.set(context.container, context);
    const repo = path.join(container, `repo ${label} \u0442\u0435\u0441\u0442`);
    mkdirSync(repo);
    runFixtureGit(repo, ['init', '--quiet']);
    const defaultHooksDir = runFixtureGit(
      repo,
      ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
    );
    mkdirSync(defaultHooksDir);
    return { container, gitEnv: context.env, repo };
  } catch (error) {
    try {
      cleanupNativeHookFixture(container);
    } catch {
      // Preserve the original setup failure; the bounded temp prefix is still known.
    }
    throw error;
  }
}

function runFixtureGit(cwd, args) {
  const context = fixtureContextForPath(cwd);
  if (!context) throw new Error(`fixture Git cwd is not registered: ${cwd}`);
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: context.env,
    killSignal: 'SIGTERM',
    timeout: 15_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`fixture git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  if (JSON.stringify(args) === JSON.stringify([
    'rev-parse', '--path-format=absolute', '--git-path', 'hooks',
  ])) {
    assertFixtureHooksPathConfined(context, result.stdout);
  }
  return String(result.stdout || '').replace(/\r?\n$/, '');
}

function cleanupNativeHookFixture(container) {
  const resolvedTemp = canonicalFixturePath(tmpdir());
  const resolvedContainer = canonicalFixturePath(container);
  const relative = path.relative(resolvedTemp, resolvedContainer);
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
    || !path.basename(resolvedContainer).startsWith('blueprints-native-hooks-')
  ) {
    throw new Error(`refusing to remove unsafe native-hook fixture: ${resolvedContainer}`);
  }
  try {
    rmSync(resolvedContainer, { force: true, recursive: true });
  } finally {
    nativeHookFixtureContexts.delete(resolvedContainer);
  }
}

function withNativeHookFixture(label, run, options = {}) {
  let fixture;
  try {
    fixture = createNativeHookFixture(label, options);
    run(fixture);
  } catch (error) {
    check(`native Git hook fixture completes: ${label}`, false, errorDetailForCheck(error));
  } finally {
    if (fixture) {
      try {
        cleanupNativeHookFixture(fixture.container);
      } catch (error) {
        check(`native Git hook fixture cleanup: ${label}`, false, errorDetailForCheck(error));
      }
    }
  }
}

function errorDetailForCheck(error) {
  if (!error) return 'unknown error';
  const code = typeof error.code === 'string' ? `${error.code}: ` : '';
  return `${code}${error.message || String(error)}`;
}

function sameFixturePath(left, right) {
  const normalize = (value) => {
    const resolved = canonicalFixturePath(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function hookTargetSnapshot(target) {
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      return { exists: true, kind: 'symlink', mode: stat.mode & 0o777 };
    }
    if (!stat.isFile()) {
      return { exists: true, kind: 'other', mode: stat.mode & 0o777 };
    }
    return {
      body: readFileSync(target).toString('base64'),
      exists: true,
      kind: 'file',
      mode: stat.mode & 0o777,
      nlink: stat.nlink,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false };
    throw error;
  }
}

function nativeHookDirectoryManifest(hooksDir) {
  try {
    return readdirSync(hooksDir).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function nativeHookTempArtifacts(hooksDir) {
  return nativeHookDirectoryManifest(hooksDir).filter((name) => name.includes('.codex-'));
}

function installedHookErrors(hooksDir) {
  const errors = [];
  for (const { name, command } of expectedNativeHooks) {
    const target = path.join(hooksDir, name);
    if (!existsSync(target)) {
      errors.push(`${name} missing`);
      continue;
    }
    const body = readFileSync(target, 'utf8');
    if (body !== expectedNativeHookBody(command)) errors.push(`${name} body differs`);
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      errors.push(`${name} is not a single-link regular file`);
    }
    if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
      errors.push(`${name} is not executable`);
    }
  }
  if (nativeHookTempArtifacts(hooksDir).length > 0) errors.push('temporary artifacts remain');
  return errors;
}

function seedLegacyNativeHooks(hooksDir) {
  for (const { name, command } of expectedNativeHooks) {
    const lineEnding = name === 'pre-commit' ? '\r\n' : '\n';
    const target = path.join(hooksDir, name);
    writeFileSync(
      target,
      expectedNativeHookBody(command, { legacy: true }).replace(/\n/g, lineEnding),
      'utf8',
    );
    chmodSync(target, name === 'pre-commit' ? 0o744 : 0o700);
  }
}

function expectInstallerFailure(run, pattern = null) {
  try {
    run();
    return { message: '', threw: false };
  } catch (error) {
    const message = errorDetailForCheck(error);
    return {
      message,
      threw: pattern ? pattern.test(message) : true,
    };
  }
}

function resolverSpawn(root, hooksDir, secondResult = null) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ args, command, options });
    if (calls.length === 1) {
      return { error: null, signal: null, status: 0, stderr: '', stdout: `${root}\n` };
    }
    return secondResult || {
      error: null,
      signal: null,
      status: 0,
      stderr: '',
      stdout: `${hooksDir}\n`,
    };
  };
  return { calls, spawn };
}

function parseFrozenDecisions(source) {
  const relevant = source.split('When changing these decisions')[0];
  const entries = [];
  const untagged = [];
  let current = null;
  for (const line of relevant.split(/\r?\n/)) {
    const tagged = /^- `(FD-\d{3})`\s+(.+)$/.exec(line);
    if (tagged) {
      if (current) entries.push(current);
      current = { id: tagged[1], text: tagged[2] };
      continue;
    }
    if (/^-\s+/.test(line)) {
      if (current) entries.push(current);
      current = null;
      untagged.push(line.trim());
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) current.text += ` ${line.trim()}`;
  }
  if (current) entries.push(current);
  return {
    entries: entries.map((entry) => ({ ...entry, text: normalizeWhitespace(entry.text) })),
    untagged,
  };
}

function frozenDecisionErrors(source) {
  const parsed = parseFrozenDecisions(source);
  const errors = [];
  if (parsed.untagged.length) errors.push(`untagged frozen bullets: ${parsed.untagged.join(' | ')}`);
  const ids = parsed.entries.map((entry) => entry.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) errors.push('duplicate frozen decision ID');
  const expectedIds = expectedFrozenDecisions.map(([id]) => id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) errors.push(`frozen decision IDs differ: ${ids.join(', ')}`);
  for (const [id, expectedText] of expectedFrozenDecisions) {
    const actual = parsed.entries.find((entry) => entry.id === id);
    if (!actual || actual.text !== normalizeWhitespace(expectedText)) errors.push(`${id} text differs`);
  }
  return errors;
}

function frozenAssertionCoverageErrors(ids) {
  const actual = [...new Set(ids)].sort();
  const expected = expectedFrozenDecisions.map(([id]) => id).sort();
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? []
    : [`frozen live assertion coverage differs: ${actual.join(', ')}`];
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fakeFilesystem(fakeRoot, tree, failures = {}) {
  function nodeFor(absolute) {
    const rel = path.relative(fakeRoot, absolute).replaceAll('\\', '/');
    const failure = failures[rel];
    if (failure) throw Object.assign(new Error(failure.message || failure.code), { code: failure.code });
    if (!Object.hasOwn(tree, rel) || tree[rel] == null) throw Object.assign(new Error(`missing ${rel}`), { code: 'ENOENT' });
    return tree[rel];
  }
  return {
    lstatSync(absolute) {
      const node = nodeFor(absolute);
      return {
        isDirectory: () => node.type === 'directory',
        isFile: () => node.type === 'file',
        isSymbolicLink: () => node.type === 'symlink',
      };
    },
    readdirSync(absolute) {
      const node = nodeFor(absolute);
      if (node.readdirError) throw Object.assign(new Error(node.readdirError), { code: 'EACCES' });
      return node.entries || [];
    },
  };
}

{
  const fakeRoot = path.resolve(root, '__p0b_js_fixture__');
  const validTree = {
    '.codex/hooks': { entries: ['z.cjs'], type: 'directory' },
    '.codex/hooks/z.cjs': { type: 'file' },
    scripts: { entries: ['nested', 'z.mjs', 'ignored.txt'], type: 'directory' },
    'scripts/ignored.txt': { type: 'file' },
    'scripts/nested': { entries: ['a.js'], type: 'directory' },
    'scripts/nested/a.js': { type: 'file' },
    'scripts/z.mjs': { type: 'file' },
  };
  const discovered = collectJavaScriptFiles({
    fsApi: fakeFilesystem(fakeRoot, validTree),
    root: fakeRoot,
  });
  check(
    'JS discovery returns a deterministic sorted inventory',
    JSON.stringify(discovered.files) === JSON.stringify(['.codex/hooks/z.cjs', 'scripts/nested/a.js', 'scripts/z.mjs'])
      && discovered.diagnostics.length === 0,
  );

  const missingRoot = collectJavaScriptFiles({
    fsApi: fakeFilesystem(fakeRoot, { ...validTree, '.codex/hooks': undefined }),
    root: fakeRoot,
  });
  check('JS discovery fails closed on a missing required root', missingRoot.diagnostics.some((item) => item.operation === 'lstat'));

  const unreadableTree = clone(validTree);
  unreadableTree.scripts.readdirError = 'permission denied';
  const unreadableRoot = collectJavaScriptFiles({
    fsApi: fakeFilesystem(fakeRoot, unreadableTree),
    root: fakeRoot,
  });
  check('JS discovery fails closed on EACCES while continuing other roots', unreadableRoot.diagnostics.some((item) => item.operation === 'readdir') && unreadableRoot.files.includes('.codex/hooks/z.cjs'));

  const symlinkTree = clone(validTree);
  symlinkTree['scripts/nested'].type = 'symlink';
  const symlinkResult = collectJavaScriptFiles({ fsApi: fakeFilesystem(fakeRoot, symlinkTree), root: fakeRoot });
  check('JS discovery rejects symlink or junction entries', symlinkResult.diagnostics.some((item) => /symbolic links and junctions/.test(item.detail)));

  const wrongRootTree = clone(validTree);
  wrongRootTree.scripts.type = 'file';
  const wrongRootResult = collectJavaScriptFiles({ fsApi: fakeFilesystem(fakeRoot, wrongRootTree), root: fakeRoot });
  check('JS discovery requires each configured root to be a directory', wrongRootResult.diagnostics.some((item) => /root must be a directory/.test(item.detail)));

  const escapedResult = collectJavaScriptFiles({
    fsApi: fakeFilesystem(fakeRoot, validTree),
    root: fakeRoot,
    roots: ['../outside'],
  });
  check('JS discovery rejects required-root escape', escapedResult.diagnostics.some((item) => item.operation === 'resolve'));

  const emptyTree = {
    '.codex/hooks': { entries: [], type: 'directory' },
    scripts: { entries: [], type: 'directory' },
  };
  const emptyResult = collectJavaScriptFiles({ fsApi: fakeFilesystem(fakeRoot, emptyTree), root: fakeRoot });
  check('JS discovery rejects zero inventory', emptyResult.files.length === 0 && emptyResult.diagnostics.some((item) => item.operation === 'inventory'));

  const unusualTree = clone(validTree);
  unusualTree['scripts/nested'].type = 'unknown';
  const unusualResult = collectJavaScriptFiles({ fsApi: fakeFilesystem(fakeRoot, unusualTree), root: fakeRoot });
  check('JS discovery rejects unknown filesystem entry types', unusualResult.diagnostics.some((item) => /unsupported filesystem entry type/.test(item.detail)));

  const invocationOrder = [];
  const sortedChecks = checkJavaScriptFiles({
    files: ['z.js', 'a.js'],
    root: fakeRoot,
    spawn: (_command, args) => {
      invocationOrder.push(args[1]);
      return { status: 0, stderr: undefined, stdout: undefined };
    },
  });
  check('JS syntax checks run in sorted order and tolerate absent output', invocationOrder.join(',') === 'a.js,z.js' && sortedChecks.every((item) => item.ok));

  const failureCases = [
    ['invalid syntax', () => ({ status: 1, stderr: 'SyntaxError', stdout: '' }), 'syntax'],
    ['EPERM spawn result', () => ({ error: Object.assign(new Error('denied'), { code: 'EPERM' }) }), 'spawn'],
    ['thrown spawn error', () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }, 'spawn'],
    ['signal termination', () => ({ signal: 'SIGTERM', status: null }), 'signal'],
    ['null status', () => ({ signal: null, status: null }), 'status'],
    ['timeout', () => ({ error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) }), 'spawn'],
    ['empty failure output', () => ({ status: 2, stderr: undefined, stdout: undefined }), 'syntax'],
  ];
  for (const [name, spawn, operation] of failureCases) {
    const [result] = checkJavaScriptFiles({ files: ['bad.js'], root: fakeRoot, spawn });
    check(`JS syntax checker controls ${name}`, !result.ok && result.operation === operation && typeof result.output === 'string');
  }
  let call = 0;
  const continuedChecks = checkJavaScriptFiles({
    files: ['a.js', 'b.js'],
    root: fakeRoot,
    spawn: () => (++call === 1 ? { status: 1 } : { status: 0 }),
  });
  check('JS syntax checker continues after a local failure', continuedChecks.length === 2 && !continuedChecks[0].ok && continuedChecks[1].ok);
}

{
  check('Blender smoke parser keeps strict mode as the default', parseSmokeArguments([]).ifAvailable === false);
  check('Blender smoke parser accepts only --if-available', parseSmokeArguments(['--if-available']).ifAvailable === true);
  let rejectedUnknown = false;
  try {
    parseSmokeArguments(['--optional']);
  } catch {
    rejectedUnknown = true;
  }
  check('Blender smoke parser rejects unknown options', rejectedUnknown);

  const missingInspection = probeBlender(path.join(
    tmpdir(),
    `blueprints-missing-blender-${process.pid}-${Date.now()}`,
  ));
  const deniedInspection = probeBlender('blender-denied', {
    spawn: () => ({
      error: Object.assign(new Error('access denied'), { code: 'EPERM' }),
    }),
  });
  check(
    'Blender production probe distinguishes ENOENT from an unlaunchable executable',
    !missingInspection.ok
      && missingInspection.missing === true
      && !deniedInspection.ok
      && deniedInspection.missing === false,
  );

  const winPath = path.win32;
  const missingProbe = () => ({ detail: 'ENOENT', missing: true, ok: false, version: '' });
  const directoryEntry = (name) => ({ isDirectory: () => true, name });

  const autoMissingProbes = [];
  const autoMissing = resolveBlender({
    env: {},
    exists: () => false,
    platform: 'win32',
    probe: (candidate) => {
      autoMissingProbes.push(candidate);
      return missingProbe();
    },
  });
  check(
    'Blender resolver distinguishes true auto-missing from configured failure',
    autoMissing.command === null
      && autoMissing.error === null
      && JSON.stringify(autoMissingProbes) === JSON.stringify(['blender']),
  );

  const portableRoot = 'D:\\Portable Programs';
  const wideRoot = 'E:\\Applications';
  const portableDirectory = 'Blender 5.1 Portable';
  const portableCandidate = winPath.join(
    wideRoot,
    'Blender Foundation',
    portableDirectory,
    'blender.exe',
  );
  const portableReads = [];
  const portableProbes = [];
  const portableResolution = resolveBlender({
    env: { ProgramFiles: portableRoot, ProgramW6432: wideRoot },
    exists: (candidate) => candidate.toLowerCase() === portableCandidate.toLowerCase(),
    platform: 'win32',
    probe: (candidate) => {
      portableProbes.push(candidate);
      return { detail: '', missing: false, ok: true, version: 'Blender 5.1.2' };
    },
    readDirectory: (directory) => {
      portableReads.push(directory);
      if (directory === winPath.join(portableRoot, 'Blender Foundation')) {
        throw Object.assign(new Error('not installed'), { code: 'ENOENT' });
      }
      return [directoryEntry(portableDirectory)];
    },
  });
  check(
    'Blender resolver discovers ProgramFiles and ProgramW6432 installations on non-C drives',
    portableResolution.command === portableCandidate
      && portableResolution.error === null
      && JSON.stringify(portableReads) === JSON.stringify([
        winPath.join(portableRoot, 'Blender Foundation'),
        winPath.join(wideRoot, 'Blender Foundation'),
      ])
      && JSON.stringify(portableProbes) === JSON.stringify([portableCandidate])
      && portableProbes.every((candidate) => !/^C:\\/i.test(candidate)),
  );
  check(
    'Blender resolver has no fixed C-drive Program Files fallback',
    !/C:\\\\Program Files\\\\Blender Foundation/.test(read('scripts/run-blender-smoke.mjs')),
  );

  const duplicateRoot = 'F:\\Program Files';
  const duplicateCandidate = winPath.join(
    duplicateRoot,
    'Blender Foundation',
    'Blender 5.1',
    'blender.exe',
  );
  let duplicateRootReads = 0;
  const duplicateCandidateProbes = [];
  const duplicateRoots = resolveBlender({
    env: { ProgramFiles: duplicateRoot, ProgramW6432: 'f:\\PROGRAM FILES\\' },
    exists: (candidate) => candidate.toLowerCase() === duplicateCandidate.toLowerCase(),
    platform: 'win32',
    probe: (candidate) => {
      if (candidate === 'blender') return missingProbe();
      duplicateCandidateProbes.push(candidate);
      return { detail: 'EPERM', missing: false, ok: false, version: '' };
    },
    readDirectory: () => {
      duplicateRootReads += 1;
      return [directoryEntry('blender 5.1'), directoryEntry('BLENDER 5.1')];
    },
  });
  check(
    'Blender resolver deduplicates ProgramFiles roots and candidates case-insensitively',
    duplicateRootReads === 1
      && duplicateRoots.command === null
      && /could not be launched/.test(duplicateRoots.error)
      && JSON.stringify(duplicateCandidateProbes) === JSON.stringify([duplicateCandidate]),
  );

  const sequenceRoot = 'G:\\Blender Suite';
  const sequenceNames = [
    'Blender 5.1 A Missing',
    'Blender 5.1 B Wrong',
    'Blender 5.1 C Broken',
    'Blender 5.1 D Valid',
  ];
  const sequenceCandidates = sequenceNames.map((name) => (
    winPath.join(sequenceRoot, 'Blender Foundation', name, 'blender.exe')
  ));
  const sequenceProbes = [];
  const continuedResolution = resolveBlender({
    env: { ProgramFiles: sequenceRoot },
    exists: (candidate) => !candidate.endsWith(`${sequenceNames[0]}\\blender.exe`)
      && sequenceCandidates.includes(candidate),
    platform: 'win32',
    probe: (candidate) => {
      sequenceProbes.push(candidate);
      if (candidate === sequenceCandidates[1]) {
        return { detail: '', missing: false, ok: true, version: 'Blender 4.3.0' };
      }
      if (candidate === sequenceCandidates[2]) {
        return { detail: 'EPERM', missing: false, ok: false, version: '' };
      }
      return { detail: '', missing: false, ok: true, version: 'Blender 5.1.2' };
    },
    readDirectory: () => sequenceNames.map(directoryEntry),
  });
  check(
    'Blender resolver continues after missing wrong-version and unlaunchable auto candidates',
    continuedResolution.command === sequenceCandidates[3]
      && continuedResolution.error === null
      && JSON.stringify(sequenceProbes) === JSON.stringify(sequenceCandidates.slice(1)),
  );

  const wrongOnlyRoot = 'H:\\Wrong Blender';
  const wrongOnlyCandidate = winPath.join(
    wrongOnlyRoot,
    'Blender Foundation',
    'Blender 5.1 Wrong',
    'blender.exe',
  );
  const autoWrongVersion = resolveBlender({
    env: { ProgramFiles: wrongOnlyRoot },
    exists: (candidate) => candidate === wrongOnlyCandidate,
    platform: 'win32',
    probe: (candidate) => candidate === 'blender'
      ? missingProbe()
      : { detail: '', missing: false, ok: true, version: 'Blender 4.3.0' },
    readDirectory: () => [directoryEntry('Blender 5.1 Wrong')],
  });
  check(
    'Blender resolver reports an exhausted wrong-version auto candidate instead of deferring',
    autoWrongVersion.command === null && /not Blender 5\.1/.test(autoWrongVersion.error),
  );

  const brokenOnlyRoot = 'I:\\Broken Blender';
  const brokenOnlyCandidate = winPath.join(
    brokenOnlyRoot,
    'Blender Foundation',
    'Blender 5.1 Broken',
    'blender.exe',
  );
  const autoUnlaunchable = resolveBlender({
    env: { ProgramFiles: brokenOnlyRoot },
    exists: (candidate) => candidate === brokenOnlyCandidate,
    platform: 'win32',
    probe: (candidate) => candidate === 'blender'
      ? missingProbe()
      : { detail: 'EPERM', missing: false, ok: false, version: '' },
    readDirectory: () => [directoryEntry('Blender 5.1 Broken')],
  });
  check(
    'Blender resolver reports an exhausted unlaunchable auto candidate instead of deferring',
    autoUnlaunchable.command === null && /could not be launched/.test(autoUnlaunchable.error),
  );

  const unreadableRoot = 'J:\\Unreadable Programs';
  const unreadableResolution = resolveBlender({
    env: { ProgramFiles: unreadableRoot },
    exists: () => false,
    platform: 'win32',
    probe: missingProbe,
    readDirectory: () => {
      throw Object.assign(new Error('access denied'), { code: 'EACCES' });
    },
  });
  check(
    'Blender resolver fails closed when a ProgramFiles root cannot be inspected',
    unreadableResolution.command === null && /Could not inspect/.test(unreadableResolution.error),
  );

  const pathFallbackEvents = [];
  const pathFallback = resolveBlender({
    env: { ProgramFiles: 'K:\\No Blender' },
    exists: () => false,
    platform: 'win32',
    probe: (candidate) => {
      pathFallbackEvents.push(`probe:${candidate}`);
      return { detail: '', missing: false, ok: true, version: 'Blender 5.1.2' };
    },
    readDirectory: () => {
      pathFallbackEvents.push('read:ProgramFiles');
      return [];
    },
  });
  check(
    'Blender resolver probes PATH only after ProgramFiles discovery',
    pathFallback.command === 'blender'
      && JSON.stringify(pathFallbackEvents) === JSON.stringify(['read:ProgramFiles', 'probe:blender']),
  );

  let explicitDiscoveryCalls = 0;
  const explicitReadDirectory = () => {
    explicitDiscoveryCalls += 1;
    return [];
  };
  const explicitMissing = resolveBlender({
    env: { BLENDER_EXE: 'C:\\missing\\blender.exe' },
    exists: () => false,
    platform: 'win32',
    readDirectory: explicitReadDirectory,
  });
  check('Blender resolver fails explicit missing BLENDER_EXE without fallback', explicitMissing.command === null && /does not exist/.test(explicitMissing.error));
  const explicitUnlaunchable = resolveBlender({
    env: { BLENDER_EXE: 'blender-custom' },
    probe: () => ({ detail: 'EPERM', ok: false, version: '' }),
    readDirectory: explicitReadDirectory,
  });
  check('Blender resolver fails explicit unlaunchable BLENDER_EXE without fallback', explicitUnlaunchable.command === null && /could not be launched/.test(explicitUnlaunchable.error));
  const explicitWrongVersion = resolveBlender({
    env: { BLENDER_EXE: 'blender-custom' },
    probe: () => ({ detail: '', ok: true, version: 'Blender 4.3.0' }),
    readDirectory: explicitReadDirectory,
  });
  check('Blender resolver fails explicit wrong-version BLENDER_EXE without fallback', explicitWrongVersion.command === null && /must be Blender 5\.1/.test(explicitWrongVersion.error));
  const explicitValidProbes = [];
  const explicitValid = resolveBlender({
    env: { BLENDER_EXE: 'blender-explicit', ProgramFiles: 'L:\\Programs' },
    probe: (candidate) => {
      explicitValidProbes.push(candidate);
      return { detail: '', missing: false, ok: true, version: 'Blender 5.1.2' };
    },
    readDirectory: explicitReadDirectory,
  });
  check(
    'Blender resolver returns a valid explicit BLENDER_EXE without auto-discovery or PATH fallback',
    explicitValid.command === 'blender-explicit'
      && explicitValid.error === null
      && JSON.stringify(explicitValidProbes) === JSON.stringify(['blender-explicit'])
      && explicitDiscoveryCalls === 0,
  );

  const optionalMessages = [];
  const optionalExit = runBlenderSmokeMain({
    argv: ['--if-available'],
    blenderResolver: () => autoMissing,
    logger: { error: (message) => optionalMessages.push(message), log: (message) => optionalMessages.push(message) },
  });
  check('conditional Blender auto-missing emits DEFER and exits zero', optionalExit === 0 && optionalMessages.some((message) => /^\[DEFER\]/.test(message)));
  const strictMessages = [];
  const strictExit = runBlenderSmokeMain({
    argv: [],
    blenderResolver: () => autoMissing,
    logger: { error: (message) => strictMessages.push(message), log: (message) => strictMessages.push(message) },
  });
  check('strict Blender auto-missing remains a failure', strictExit === 1 && strictMessages.some((message) => /Blender 5\.1 was not found/.test(message)));
  const configuredMessages = [];
  const configuredExit = runBlenderSmokeMain({
    argv: ['--if-available'],
    blenderResolver: () => explicitWrongVersion,
    logger: { error: (message) => configuredMessages.push(message), log: (message) => configuredMessages.push(message) },
  });
  check('conditional Blender never defers an explicit configuration failure', configuredExit === 1 && configuredMessages.some((message) => /^\[FAIL\]/.test(message)));
  const autoFailureMessages = [];
  const autoFailureExit = runBlenderSmokeMain({
    argv: ['--if-available'],
    blenderResolver: () => autoUnlaunchable,
    logger: { error: (message) => autoFailureMessages.push(message), log: (message) => autoFailureMessages.push(message) },
  });
  check(
    'conditional Blender never defers an auto-discovery failure',
    autoFailureExit === 1
      && autoFailureMessages.some((message) => /^\[FAIL\]/.test(message))
      && autoFailureMessages.every((message) => !/^\[DEFER\]/.test(message)),
  );
  const foundSmokeFailure = runBlenderSmokeMain({
    argv: ['--if-available'],
    blenderResolver: () => ({ command: 'blender', error: null, version: 'Blender 5.1.0' }),
    logger: { error: () => {}, log: () => {} },
    smokeRunner: () => 1,
  });
  check('conditional Blender propagates a found smoke failure', foundSmokeFailure === 1);
}

for (const file of requiredFiles) {
  check(`required file exists: ${file}`, exists(file));
}

for (const [file, expected] of Object.entries(expectedCompatibilityPointers)) {
  check(`${file} is an exact AGENTS.md compatibility pointer`, exists(file) && read(file).replace(/\r\n/g, '\n') === expected);
}

if (exists('docs/agent/frozen-decisions.md')) {
  const frozen = read('docs/agent/frozen-decisions.md');
  const errors = frozenDecisionErrors(frozen);
  check('frozen decisions match the exact FD-001 through FD-014 contract', errors.length === 0, errors.join('; '));
  const firstBullet = '- `FD-001` Product scope is selected: Blender add-on + local standalone backend.';
  for (const [name, candidate] of [
    ['missing ID', frozen.replace(firstBullet, '')],
    ['duplicate ID', frozen.replace(firstBullet, `${firstBullet}\n${firstBullet}`)],
    ['unknown ID', frozen.replace(firstBullet, `${firstBullet}\n- \`FD-999\` Unknown decision.`)],
    ['one-character text drift', frozen.replace('Product scope is selected', 'Product scope is Selected')],
  ]) {
    check(`frozen negative fixture rejects ${name}`, frozenDecisionErrors(candidate).length > 0);
  }
  const crlfFrozen = frozen.replace(/\r?\n/g, '\r\n');
  check(
    'frozen negative fixture rejects a missing ID with CRLF input',
    frozenDecisionErrors(crlfFrozen.replace(firstBullet, '')).length > 0,
  );
}

{
  const config = exists('.codex/config.toml') ? read('.codex/config.toml') : '';
  const profile = exists('docs/agent/profiles/blender-addon.md') ? read('docs/agent/profiles/blender-addon.md') : '';
  const windowsProfileDoc = exists('docs/agent/profiles/windows-exe.md') ? read('docs/agent/profiles/windows-exe.md') : '';
  const activationAdr = exists('docs/agent/adrs/0003-blender-addon-backend-activation.md')
    ? read('docs/agent/adrs/0003-blender-addon-backend-activation.md')
    : '';
  const agents = exists('AGENTS.md') ? read('AGENTS.md') : '';
  const readme = exists('README.md') ? read('README.md') : '';
  const packageConfig = exists('package.json') ? JSON.parse(read('package.json')) : {};
  const workflow = exists('.github/workflows/codex-infra.yml') ? read('.github/workflows/codex-infra.yml') : '';
  const lefthook = exists('lefthook.yml') ? read('lefthook.yml') : '';
  const bridge = exists('blender_addon/blueprints_addon/bridge.py') ? read('blender_addon/blueprints_addon/bridge.py') : '';
  const addonEntrypoint = exists('blender_addon/blueprints_addon/__init__.py') ? read('blender_addon/blueprints_addon/__init__.py') : '';
  const blenderRunner = exists('scripts/run-blender-smoke.mjs') ? read('scripts/run-blender-smoke.mjs') : '';
  const packageRelease = exists('scripts/package_release.py') ? read('scripts/package_release.py') : '';
  const migration = exists('docs/agent/migration-inventory.md') ? read('docs/agent/migration-inventory.md') : '';

  checkFrozenLive(
    'FD-001',
    'selected add-on and local standalone backend scope is exact',
    /app_stack\s*=\s*"blender-addon-backend"/.test(config)
      && /product_scope\s*=\s*"Blender add-on \+ local standalone backend"/.test(config)
      && /Product scope is selected: Blender add-on \+ local standalone backend\./.test(agents)
      && exists('blender_addon/blueprints_addon/__init__.py')
      && exists('backend/src/blueprints_backend/__init__.py'),
  );
  checkFrozenLive(
    'FD-002',
    'Node package is a dependency-free private verification harness',
    /tooling_runtime\s*=\s*"node-verification-harness"/.test(config)
      && packageConfig.private === true
      && !Object.hasOwn(packageConfig, 'dependencies')
      && !Object.hasOwn(packageConfig, 'devDependencies')
      && packageScriptErrors(packageConfig.scripts || {}).length === 0,
  );
  checkFrozenLive(
    'FD-003',
    'profile states are exact across every live projection',
    profileProjectionErrors({
      agents,
      blenderDoc: profile,
      config,
      readme,
      windowsDoc: windowsProfileDoc,
    }).length === 0,
  );
  const profileProjection = {
    agents,
    blenderDoc: profile,
    config,
    readme,
    windowsDoc: windowsProfileDoc,
  };
  for (const [name, mutate] of [
    ['config conflict', (value) => { value.config = value.config.replace('status = "dormant"', 'status = "dormant"\nstatus = "active"'); }],
    ['AGENTS conflict', (value) => { value.agents += '\nThe `windows-exe` profile is active.\n'; }],
    ['paraphrased AGENTS conflict', (value) => { value.agents += '\nProfile status for `windows-exe`: active.\n'; }],
    ['unquoted AGENTS conflict', (value) => { value.agents += '\nProfile status for windows-exe: active.\n'; }],
    ['wrapped AGENTS conflict', (value) => { value.agents += '\nProfile status for `windows-exe`:\nactive.\n'; }],
    ['README conflict', (value) => { value.readme += '\n- Active profile: `windows-exe`.\n'; }],
    ['paraphrased README conflict', (value) => { value.readme += '\nProfile status for `blender-addon`: dormant.\n'; }],
    ['Blender profile conflict', (value) => {
      value.blenderDoc = value.blenderDoc.replace(
        '## Historical Iteration Contracts',
        'Profile status: dormant.\n\n## Historical Iteration Contracts',
      );
    }],
    ['Windows profile conflict', (value) => { value.windowsDoc += '\nStatus: active.\n'; }],
  ]) {
    const candidate = { ...profileProjection };
    mutate(candidate);
    check(
      `frozen negative fixture rejects additive ${name}`,
      profileProjectionErrors(candidate).length > 0,
    );
  }
  const crossProfileProjection = {
    ...profileProjection,
    windowsDoc: `${windowsProfileDoc}\nThe \`blender-addon\` profile is active.\n`,
  };
  check(
    'frozen positive fixture permits an explicit cross-profile state mention',
    profileProjectionErrors(crossProfileProjection).length === 0,
  );
  checkFrozenLive(
    'FD-004',
    'Blender 5.1 is enforced by add-on metadata and executable probe',
    /"blender":\s*\(5,\s*1,\s*0\)/.test(addonEntrypoint)
      && /\\bBlender 5\\\.1\\b/.test(blenderRunner),
  );
  checkFrozenLive(
    'FD-005',
    'Python-first FreeCAD TechDraw provider boundary is projected live',
    /Backend: Python-first\./.test(profile)
      && /MVP geometry provider: FreeCAD\/TechDraw behind a provider boundary\./.test(profile)
      && /Backend: Python-first\./.test(activationAdr),
  );
  checkFrozenLive(
    'FD-006',
    'native OCCT C++ remains profiling-gated',
    /Future geometry provider: native OCCT\/C\+\+ only after profiling justifies it\./.test(profile)
      && /Future geometry provider: native OCCT\/C\+\+ only after profiling justifies it\./.test(activationAdr),
  );
  checkFrozenLive(
    'FD-007',
    'bridge uses subprocess transport with trusted backend cwd and job argument',
    /command\s*=\s*\[python_executable, "-m", "blueprints_backend", str\(job_dir\)\]/.test(bridge)
      && /subprocess\.run\(/.test(bridge)
      && /cwd=str\(backend_src_path\)/.test(bridge)
      && !/cwd=str\(job_dir\)/.test(bridge),
  );
  checkFrozenLive(
    'FD-008',
    'SVG canonical and derived-output boundaries are projected live',
    /canonical_output\s*=\s*"svg"/.test(config)
      && /Derived outputs: DXF and PDF\./.test(profile)
      && /DWG: not core v1\./.test(profile),
  );
  checkFrozenLive(
    'FD-009',
    'GPL boundary remains separate-process and two-distribution',
    /GPL-sensitive dependencies: allowed only across a separate[\s\S]{0,80}process\/distribution boundary\./.test(profile)
      && /subprocess\.run\(/.test(bridge)
      && /"id": "blender_addon_zip"/.test(packageRelease)
      && /"id": "backend_bundle_zip"/.test(packageRelease),
  );
  checkFrozenLive(
    'FD-010',
    'source repository rules remain reference material',
    /reference\s+material,\s+not active policy/.test(migration)
      && /Do not promote source-repository rules/.test(agents),
  );
  const skillDirs = exists('plugins/blueprints-codex/skills')
    ? readdirSync(path.join(root, 'plugins/blueprints-codex/skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    : [];
  checkFrozenLive(
    'FD-011',
    'every skill owns SKILL.md and agents/openai.yaml',
    skillDirs.length > 0 && skillDirs.every((name) => (
      exists(`plugins/blueprints-codex/skills/${name}/SKILL.md`)
      && exists(`plugins/blueprints-codex/skills/${name}/agents/openai.yaml`)
    )),
  );
  const agentFiles = exists('.codex/agents')
    ? readdirSync(path.join(root, '.codex/agents'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.toml'))
      .map((entry) => `.codex/agents/${entry.name}`)
    : [];
  checkFrozenLive(
    'FD-012',
    'every agent has the complete audit result contract',
    agentFiles.length > 0 && agentFiles.every((rel) => {
      const instructions = /developer_instructions\s*=\s*"""([\s\S]*?)"""/.exec(read(rel))?.[1] || '';
      return /PASS\/FAIL/.test(instructions)
        && /evidence/i.test(instructions)
        && /findings/i.test(instructions)
        && /blockers/i.test(instructions)
        && /explicit defers/i.test(instructions);
    }),
  );
  checkFrozenLive(
    'FD-013',
    'ship command closes package config CI and local pre-push projections',
    packageConfig.scripts?.['codex:ship'] === 'npm run quality:deep'
      && /ship_command\s*=\s*"npm run codex:ship"/.test(config)
      && workflowErrors(workflow).length === 0
      && nativeHookContractErrors(NATIVE_HOOKS).length === 0
      && lefthook.replace(/\r\n/g, '\n') === expectedLefthook,
  );
  const verificationAgent = exists('.codex/agents/verification_reviewer.toml')
    ? read('.codex/agents/verification_reviewer.toml')
    : '';
  const bootstrap = exists('docs/agent/bootstrap.md') ? read('docs/agent/bootstrap.md') : '';
  const codeReview = exists('docs/agent/code_review.md') ? read('docs/agent/code_review.md') : '';
  checkFrozenLive(
    'FD-014',
    'final review and labeled fallback remain mandatory',
    /\/review/.test(verificationAgent)
      && /requirements and diff review fallback/.test(verificationAgent)
      && /\/review/.test(bootstrap)
      && /fallback/.test(bootstrap)
      && /\/review/.test(codeReview)
      && /fallback/.test(codeReview),
  );
}

{
  const coverageErrors = frozenAssertionCoverageErrors(frozenLiveAssertionIds);
  check('every frozen decision has an independent live assertion', coverageErrors.length === 0, coverageErrors.join('; '));
  check(
    'frozen negative fixture rejects an ID without a live assertion',
    frozenAssertionCoverageErrors([...frozenLiveAssertionIds].filter((id) => id !== 'FD-014')).length > 0,
  );
}

if (exists('.codex/agents')) {
  const agentFiles = readdirSync(path.join(root, '.codex/agents'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.toml'))
    .map((entry) => entry.name.replace(/\.toml$/, ''))
    .sort();
  const expectedAgents = [...requiredAgents].sort();
  const missingAgents = expectedAgents.filter((name) => !agentFiles.includes(name));
  const extraAgents = agentFiles.filter((name) => !expectedAgents.includes(name));
  check('agent inventory has no missing agents', missingAgents.length === 0, missingAgents.join(', '));
  check('agent inventory has no extra agents', extraAgents.length === 0, extraAgents.join(', '));
}

for (const agent of requiredAgents) {
  const rel = `.codex/agents/${agent}.toml`;
  check(`agent exists: ${agent}`, exists(rel));
  if (exists(rel)) {
    const body = read(rel);
    const mode = tomlField(body, 'sandbox_mode');
    const instructions = /developer_instructions\s*=\s*"""([\s\S]*?)"""/.exec(body)?.[1] || '';
    check(`agent name matches file: ${agent}`, tomlField(body, 'name') === agent);
    check(`agent has description: ${agent}`, tomlField(body, 'description').length > 20);
    check(`agent has allowed sandbox_mode: ${agent}`, ['read-only', 'workspace-write'].includes(mode), mode);
    check(`standard audit agent is read-only: ${agent}`, mode === 'read-only', mode);
    check(`agent has developer_instructions: ${agent}`, /developer_instructions\s*=/.test(body));
    check(`agent has read/write contract: ${agent}`, /do not edit files|Read-only|Do not modify files unless explicitly assigned/i.test(instructions));
    if (mode === 'workspace-write') {
      check(`workspace-write agent requires explicit assignment: ${agent}`, /explicitly assigned/i.test(instructions));
    }
    check(
      `agent has complete output contract: ${agent}`,
      /PASS\/FAIL/.test(instructions)
        && /evidence/i.test(instructions)
        && /findings/i.test(instructions)
        && /blockers/i.test(instructions)
        && /explicit defers/i.test(instructions),
    );
  }
}

if (exists('AGENTS.md')) {
  const agents = read('AGENTS.md');
  check('AGENTS declares selected Blender backend scope', /Blender add-on \+ local standalone backend/.test(agents));
  check('AGENTS keeps Node out of product runtime', /Node package in this repo is a verification command harness, not the\s+product runtime/.test(agents));
  check('AGENTS declares authority order', /current user request > AGENTS\.md > scripts\/verify-codex-infra\.mjs/.test(agents));
  check('AGENTS requires explicit spawned subagents', /explicit spawned subagents/.test(agents));
  check('AGENTS requires final review fallback', /\/review/.test(agents) && /fallback/.test(agents));
}

if (exists('.codex/hooks.json')) {
  const config = JSON.parse(read('.codex/hooks.json'));
  const errors = hookConfigErrors(config);
  check('hooks match the exact approved topology', errors.length === 0, errors.join('; '));
  for (const [name, mutate] of [
    ['matcher mutation is rejected', (value) => { value.hooks.PostToolUse[0].matcher = 'Write'; }],
    ['command mutation is rejected', (value) => { value.hooks.PostToolUse[0].hooks[0].command += ' --unsafe'; }],
    ['timeout mutation is rejected', (value) => { value.hooks.PostToolUse[0].hooks[0].timeout = 180; }],
    ['status mutation is rejected', (value) => { value.hooks.PostToolUse[0].hooks[0].statusMessage = 'partial'; }],
  ]) {
    const candidate = clone(config);
    mutate(candidate);
    check(`hook negative fixture: ${name}`, hookConfigErrors(candidate).length > 0);
  }
}


const expectedContextHookLegacyContract = Object.freeze({
  count: 105,
  digest: '7256DBECCF700EB3684002B899FDA124D3E370E700EA9B4B2E71A3232552473F',
  first: 'SessionStart executable emits the approved exact contract',
  last: 'context hook no-output oracle rejects unexpected stdout',
});
const expectedContextHookModuleSourceDigest = 'D5C2EF9CC0AFE8327747019A3D3A7BD599A09726104A3D2D6EF03341F9701518';
const contextHookModuleSourceFixture = 'export function registerContextHookChecks(options) {}\n';
const contextHookModuleSourceFixtureDigest = '916116AA1B6BA87F1326FD391CD6115411D340C561346C2901A7FD43D8C643E9';
check(
  'context hook source contract accepts the exact baseline with LF or CRLF endings',
  contextHookModuleSourceContract(
    contextHookModuleSourceFixture,
    contextHookModuleSourceFixtureDigest,
  ).errors.length === 0
    && contextHookModuleSourceContract(
      contextHookModuleSourceFixture.replaceAll('\n', '\r\n'),
      contextHookModuleSourceFixtureDigest,
    ).errors.length === 0,
);
for (const [name, source] of [
  ['appended source', `${contextHookModuleSourceFixture}// appended mutation\n`],
  ['changed source', contextHookModuleSourceFixture.replace('options', 'changedOptions')],
]) {
  check(
    `context hook source contract rejects ${name}`,
    contextHookModuleSourceContract(source, contextHookModuleSourceFixtureDigest).errors.length > 0,
  );
}
check(
  'context hook source contract rejects a leading BOM',
  contextHookModuleSourceContract(
    `\uFEFF${contextHookModuleSourceFixture}`,
    contextHookModuleSourceFixtureDigest,
  ).errors.some((error) => error.includes('BOM')),
);
const contextHookModuleSnapshotUrlFixture = contextHookModuleSnapshotUrlForSource(
  contextHookModuleSourceFixture,
);
check(
  'context hook source snapshot URL round-trips only the exact source',
  contextHookModuleSnapshotUrlMatchesSource(
    contextHookModuleSnapshotUrlFixture,
    contextHookModuleSourceFixture,
  )
    && !contextHookModuleSnapshotUrlMatchesSource(
      contextHookModuleSnapshotUrlFixture,
      `${contextHookModuleSourceFixture}// mutation`,
    ),
);

const contextHookModuleSource = exists(contextHookModuleRelativePath) ? read(contextHookModuleRelativePath) : '';
const contextHookModuleSourceContractResult = contextHookModuleSourceContract(
  contextHookModuleSource,
  expectedContextHookModuleSourceDigest,
);
check(
  'context hook verifier module matches the normalized-source golden before import',
  contextHookModuleSourceContractResult.errors.length === 0,
  contextHookModuleSourceContractResult.errors.join('; '),
);
const contextHookModuleSnapshotUrl = contextHookModuleSourceContractResult.errors.length === 0
  ? contextHookModuleSnapshotUrlForSource(contextHookModuleSource)
  : '';
const contextHookModuleSnapshotMatchesSource = contextHookModuleSnapshotUrlMatchesSource(
  contextHookModuleSnapshotUrl,
  contextHookModuleSource,
);
check(
  'context hook verifier import snapshot preserves the accepted source read exactly',
  contextHookModuleSourceContractResult.errors.length === 0
    && contextHookModuleSnapshotMatchesSource,
);

const contextHookImportProbeSentinel = 'BLUEPRINTS_CONTEXT_HOOK_IMPORT_OK';
const contextHookModuleImportProbe = contextHookModuleSourceContractResult.errors.length === 0
    && contextHookModuleSnapshotMatchesSource
  ? spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    'await import('
      + JSON.stringify(contextHookModuleSnapshotUrl)
      + '); process.stdout.write('
      + JSON.stringify(contextHookImportProbeSentinel)
      + ')',
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  })
  : { error: null, signal: null, status: null, stderr: 'source golden precheck rejected the module', stdout: '' };
const contextHookImportProbeSafe = contextHookImportProbeIsSafe(contextHookModuleImportProbe, contextHookImportProbeSentinel);
check('context hook verifier child imports the source snapshot and reaches only the exact sentinel', contextHookImportProbeSafe);

const contextHookImportCheckCount = checks.length;
let contextHookModule = null;
let contextHookModuleImportError = null;
if (
  contextHookModuleSourceContractResult.errors.length === 0
  && contextHookModuleSnapshotMatchesSource
  && contextHookImportProbeSafe
) {
  try {
    contextHookModule = await import(contextHookModuleSnapshotUrl);
  } catch (error) {
    contextHookModuleImportError = error;
  }
}
const contextHookModuleImportRegistrationCount = checks.length - contextHookImportCheckCount;
const contextHookModuleExportFixture = { registerContextHookChecks(options) {} };
check(
  'context hook module export contract accepts the exact baseline',
  contextHookModuleExportContractErrors(contextHookModuleExportFixture).length === 0,
);
for (const [name, moduleNamespace] of [
  ['missing export', {}],
  ['additional export', { ...contextHookModuleExportFixture, additionalExport: true }],
  ['non-function export', { registerContextHookChecks: true }],
]) {
  check(
    `context hook module export contract rejects ${name}`,
    contextHookModuleExportContractErrors(moduleNamespace).length > 0,
  );
}
const contextHookModuleExportErrors = contextHookModuleExportContractErrors(contextHookModule);
check(
  'context hook verifier module has the exact sole registration export',
  !contextHookModuleImportError && contextHookModuleExportErrors.length === 0,
  contextHookModuleImportError
    ? errorDetailForCheck(contextHookModuleImportError)
    : contextHookModuleExportErrors.join('; '),
);
check(
  'context hook verifier parent imports the verified source snapshot after the child probe',
  !contextHookModuleImportError
    && contextHookModuleSourceContractResult.errors.length === 0
    && contextHookModuleSnapshotMatchesSource
    && contextHookImportProbeSafe,
);
check('context hook verifier import registers no checks', contextHookModuleImportRegistrationCount === 0, 'registered=' + contextHookModuleImportRegistrationCount);

const registeredContextHookChecks = [];
const contextHookRegistrationOptions = Object.freeze({
  check(name, condition, detail = '') {
    registeredContextHookChecks.push({ name, condition: Boolean(condition), detail });
  },
  exists,
  read,
  root,
  spawn: spawnSync,
  execPath: process.execPath,
  join: path.join,
});
let contextHookRegistrationCalls = 0;
let contextHookRegistrationError = null;
let contextHookRegistrationReturn;
let contextHookRegistrationThrew = false;
const contextHookRegistrationArity = contextHookModuleExportErrors.length === 0
  ? contextHookModule.registerContextHookChecks.length
  : null;
if (contextHookModuleExportErrors.length === 0) {
  contextHookRegistrationCalls += 1;
  try {
    contextHookRegistrationReturn = contextHookModule.registerContextHookChecks(contextHookRegistrationOptions);
  } catch (error) {
    contextHookRegistrationThrew = true;
    contextHookRegistrationError = error;
  }
}
const contextHookInvocationFixtureBaseline = Object.freeze({
  arity: 1,
  calls: 1,
  error: null,
  returnValue: undefined,
  threw: false,
});
check(
  'context hook registration invocation contract accepts the exact baseline',
  contextHookRegistrationInvocationErrors(contextHookInvocationFixtureBaseline).length === 0,
);
for (const [name, result] of [
  ['zero calls', { ...contextHookInvocationFixtureBaseline, calls: 0 }],
  ['two calls', { ...contextHookInvocationFixtureBaseline, calls: 2 }],
  ['arity mismatch', { ...contextHookInvocationFixtureBaseline, arity: 0 }],
  ['Promise or async return', { ...contextHookInvocationFixtureBaseline, returnValue: Promise.resolve() }],
  [
    'thrown error',
    { ...contextHookInvocationFixtureBaseline, error: new Error('fixture error'), threw: true },
  ],
  [
    'throw undefined',
    { ...contextHookInvocationFixtureBaseline, error: undefined, threw: true },
  ],
]) {
  check(
    `context hook registration invocation contract rejects ${name}`,
    contextHookRegistrationInvocationErrors(result).length > 0,
  );
}
const contextHookRegistrationInvocation = Object.freeze({
  arity: contextHookRegistrationArity,
  calls: contextHookRegistrationCalls,
  error: contextHookRegistrationError,
  returnValue: contextHookRegistrationReturn,
  threw: contextHookRegistrationThrew,
});
const contextHookRegistrationInvocationErrorsFound = contextHookRegistrationInvocationErrors(
  contextHookRegistrationInvocation,
);
const contextHookRegistrationValidation = contextHookRegistrationValidationErrors(
  registeredContextHookChecks,
  expectedContextHookLegacyContract,
);
check(
  'context hook verifier registration uses one injected options object exactly once',
  contextHookRegistrationInvocationErrorsFound.length === 0,
  contextHookRegistrationInvocationErrorsFound.join('; '),
);
check('context hook verifier registration preserves the exact legacy 105-check order', contextHookRegistrationValidation.length === 0, contextHookRegistrationValidation.join('; '));
const contextHookRegistrationReady = contextHookRegistrationInvocation.threw === false
  && contextHookRegistrationInvocationErrorsFound.length === 0
  && contextHookRegistrationValidation.length === 0;
const contextHookReplayStart = checks.length;
if (contextHookRegistrationReady) {
  for (const record of registeredContextHookChecks) check(record.name, record.condition, record.detail);
}
const replayedContextHookNames = checks.slice(contextHookReplayStart).map(({ name }) => name);
check(
  'context hook verifier atomically replays the validated 105 records exactly once',
  contextHookRegistrationReady
    && JSON.stringify(replayedContextHookNames) === JSON.stringify(
      registeredContextHookChecks.map(({ name }) => name),
    ),
);

const contextHookRegistrationFixtureBaseline = Object.freeze(['first', 'second', 'third']);
const contextHookRegistrationFixtureExpectation = contextHookRegistrationExpectation(contextHookRegistrationFixtureBaseline);
const contextHookRegistrationFixtureRecords = contextHookRegistrationFixtureBaseline.map((name) => ({ condition: true, detail: '', name }));
check('context hook registrar validation accepts an independent exact record baseline', contextHookRegistrationValidationErrors(contextHookRegistrationFixtureRecords, contextHookRegistrationFixtureExpectation).length === 0);
for (const [name, records] of [
  ['non-array records', null],
  ['missing record', contextHookRegistrationFixtureRecords.slice(0, -1)],
  ['additional record', [...contextHookRegistrationFixtureRecords, { condition: true, detail: '', name: 'fourth' }]],
  ['duplicate record', [...contextHookRegistrationFixtureRecords.slice(0, -1), { condition: true, detail: '', name: 'second' }]],
  ['reordered records', [...contextHookRegistrationFixtureRecords].reverse()],
  ['renamed record', [{ condition: true, detail: '', name: 'renamed' }, ...contextHookRegistrationFixtureRecords.slice(1)]],
  ['malformed record', [null, ...contextHookRegistrationFixtureRecords.slice(1)]],
  [
    'record with an extra key',
    [{ ...contextHookRegistrationFixtureRecords[0], extra: true }, ...contextHookRegistrationFixtureRecords.slice(1)],
  ],
  [
    'record with an empty name',
    [{ ...contextHookRegistrationFixtureRecords[0], name: '' }, ...contextHookRegistrationFixtureRecords.slice(1)],
  ],
  [
    'record with a non-boolean condition',
    [{ ...contextHookRegistrationFixtureRecords[0], condition: 1 }, ...contextHookRegistrationFixtureRecords.slice(1)],
  ],
  [
    'record with a non-string detail',
    [{ ...contextHookRegistrationFixtureRecords[0], detail: null }, ...contextHookRegistrationFixtureRecords.slice(1)],
  ],
]) check('context hook registrar validation rejects ' + name, contextHookRegistrationValidationErrors(records, contextHookRegistrationFixtureExpectation).length > 0);

const contextHookModuleLiteralReferenceInventory = collectJavaScriptFiles({ root });
const contextHookModuleBasename = path.basename(contextHookModuleRelativePath);
const contextHookModuleFullPathLiteralReferenceFiles = contextHookModuleLiteralReferenceInventory.files
  .filter((relativePath) => read(relativePath).includes(contextHookModuleRelativePath))
  .sort();
const contextHookModuleBasenameLiteralReferenceFiles = contextHookModuleLiteralReferenceInventory.files
  .filter((relativePath) => read(relativePath).includes(contextHookModuleBasename))
  .sort();
check(
  'context hook verifier literal-reference inventory is main-only',
  contextHookModuleLiteralReferenceInventory.diagnostics.length === 0
    && JSON.stringify(contextHookModuleFullPathLiteralReferenceFiles)
      === JSON.stringify(['scripts/verify-codex-infra.mjs'])
    && JSON.stringify(contextHookModuleBasenameLiteralReferenceFiles)
      === JSON.stringify(['scripts/verify-codex-infra.mjs']),
  [
    ...contextHookModuleFullPathLiteralReferenceFiles,
    ...contextHookModuleBasenameLiteralReferenceFiles,
  ].join(', '),
);
const productionContextHookSources = Object.freeze([
  '.codex/hooks/session-start.js',
  '.codex/hooks/user-prompt-nudge.js',
]);
const productionContextHookLiteralReferenceFiles = productionContextHookSources
  .filter((relativePath) => (
    !exists(relativePath)
      || read(relativePath).includes(contextHookModuleRelativePath)
      || read(relativePath).includes(contextHookModuleBasename)
  ));
check(
  'production context hooks contain no raw verifier module path or basename',
  productionContextHookLiteralReferenceFiles.length === 0,
  productionContextHookLiteralReferenceFiles.join(', '),
);
const mainVerifierSource = read('scripts/verify-codex-infra.mjs');
check(
  'context hook verifier extraction leaves no executable legacy declarations or block seam in main',
  !/^const expectedContextHooks\s*=/m.test(mainVerifierSource)
    && !/^const expectedUserPromptTriggers\s*=/m.test(mainVerifierSource)
    && !/^function (?:contextHookEnvelope|contextHookResult|runContextHook|contextHookExecutionErrors|userPromptTriggerInventoryErrors)\s*\(/m.test(mainVerifierSource)
    && !/^if \(\n\s*exists\(expectedContextHooks\./m.test(mainVerifierSource),
);

if (exists('.codex/config.toml')) {
  const config = read('.codex/config.toml');
  check('project app stack is selected', /app_stack\s*=\s*"blender-addon-backend"/.test(config));
  const windowsProfile = profileBlock(config, 'windows-exe');
  const blenderProfile = profileBlock(config, 'blender-addon');
  check('profile block exists: windows-exe', Boolean(windowsProfile));
  check('profile is dormant: windows-exe', /status\s*=\s*"dormant"/.test(windowsProfile));
  check('profile block exists: blender-addon', Boolean(blenderProfile));
  check('profile is active: blender-addon', /status\s*=\s*"active"/.test(blenderProfile));
}

if (exists('.github/workflows/codex-infra.yml')) {
  const workflowInventory = readdirSync(path.join(root, '.github', 'workflows'), { withFileTypes: true })
    .map((entry) => ({
      name: entry.name,
      type: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'link' : 'unknown',
    }));
  const workflow = read('.github/workflows/codex-infra.yml');
  const errors = workflowErrors(workflow);
  const inventoryErrors = workflowInventoryErrors(workflowInventory);
  check('CI workflow inventory is exact', inventoryErrors.length === 0, inventoryErrors.join('; '));
  check(
    'CI negative fixture rejects an extra workflow',
    workflowInventoryErrors([...workflowInventory, { name: 'extra.yml', type: 'file' }]).length > 0,
  );
  check('CI matches the exact approved topology', errors.length === 0, errors.join('; '));
  check('CI negative fixture rejects extra run step', workflowErrors(`${workflow}      - run: npm run test:blender\n`).length > 0);
  check('CI negative fixture rejects OS drift', workflowErrors(workflow.replace('windows-latest', 'macos-latest')).length > 0);
  check(
    'CI negative fixture rejects changed step order',
    workflowErrors(workflow.replace(
      /      - uses: actions\/checkout@v4\r?\n      - uses: actions\/setup-node@v4/,
      '      - uses: actions/setup-node@v4\n      - uses: actions/checkout@v4',
    )).length > 0,
  );
  check(
    'CI negative fixture rejects changed command',
    workflowErrors(workflow.replace('      - run: npm run codex:ship', '      - run: npm run quality:deep')).length > 0,
  );
  check('CI negative fixture rejects continue-on-error', workflowErrors(workflow.replace('      - run: npm ci', '      - run: npm ci\n        continue-on-error: true')).length > 0);
}

if (exists('package.json')) {
  const packageJson = read('package.json');
  const packageConfig = JSON.parse(packageJson);
  const scripts = packageConfig.scripts || {};
  const scriptErrors = packageScriptErrors(scripts);
  check('package scripts match the exact approved graph', scriptErrors.length === 0, scriptErrors.join('; '));
  for (const [name, mutate] of [
    ['extra script', (value) => { value.extra = 'node extra.mjs'; }],
    ['missing script', (value) => { delete value.verify; }],
    ['reordered closure', (value) => { value['quality:deep'] = 'npm run test:backend && npm run quality:fast && npm run test:packaging'; }],
    ['cycle', (value) => { value['quality:fast'] = 'npm run codex:ship'; }],
  ]) {
    const candidate = { ...scripts };
    mutate(candidate);
    check(`package negative fixture rejects ${name}`, packageScriptErrors(candidate).length > 0);
  }

  if (exists('package-lock.json')) {
    const packageLock = JSON.parse(read('package-lock.json'));
    check(
      'Node harness version matches package-lock root metadata',
      packageConfig.version === packageLock.version
        && packageConfig.version === packageLock.packages?.['']?.version,
    );
    check('Node verification harness version is 0.1.0', packageConfig.version === '0.1.0', packageConfig.version);
  }
}

if (exists('scripts/lib/python-resolver.mjs')) {
  const resolverRelativePath = 'scripts/lib/python-resolver.mjs';
  const resolverBody = read(resolverRelativePath);
  const runtimeConsumers = [
    'scripts/run-blender-smoke.mjs',
    'scripts/run-packaging-smoke.mjs',
    'scripts/run-python-tests.mjs',
  ];
  const resolverExports = [...resolverBody.matchAll(
    /^export\s+(?:async\s+)?(?:class|const|function|let|var)\s+([A-Za-z_$][\w$]*)/gm,
  )].map((match) => match[1]);
  const liveJavaScript = collectJavaScriptFiles({ root });
  const runtimeResolverImporters = liveJavaScript.files
    .filter((relativePath) => relativePath !== 'scripts/verify-codex-infra.mjs')
    .filter((relativePath) => /from\s+['"][^'"]*python-resolver\.mjs['"]/.test(read(relativePath)))
    .sort();
  const localResolverPattern = /function\s+(?:bundledCodexPython|canRunPython|fromEnv|fromPythonEnv|pythonCandidates|resolvePython)\s*\(/;

  check(
    'shared Python resolver exposes one narrow production API',
    JSON.stringify(resolverExports) === JSON.stringify(['resolvePython']),
    resolverExports.join(', '),
  );
  check(
    'exactly three runtime runners import the shared Python resolver',
    JSON.stringify(runtimeResolverImporters) === JSON.stringify(runtimeConsumers),
    runtimeResolverImporters.join(', '),
  );
  check(
    'Python runners contain no residual local resolver clones',
    runtimeConsumers.every((relativePath) => {
      const body = read(relativePath);
      return !localResolverPattern.test(body)
        && !/codex-runtimes/.test(body);
    }),
  );
  check(
    'all three Python runners wire the shared resolver through their exact production seam',
    /resolvePython\(\{\s*env,\s*root,\s*spawn\s*\}\)/.test(read('scripts/run-python-tests.mjs'))
      && /pythonResolver\s*=\s*resolvePython/.test(read('scripts/run-packaging-smoke.mjs'))
      && /pythonResolver\(\{\s*env,\s*root,\s*spawn\s*\}\)/.test(read('scripts/run-packaging-smoke.mjs'))
      && /pythonResolver\s*=\s*resolvePython/.test(read('scripts/run-blender-smoke.mjs'))
      && /pythonResolver\(\{\s*env,\s*root\s*\}\)/.test(read('scripts/run-blender-smoke.mjs')),
  );
  check(
    'all three Python resolver consumers preserve selected launcher arguments at the task boundary',
    /spawn\(selected\.command,\s*\[\s*\.\.\.selected\.args,\s*'-m'/.test(read('scripts/run-python-tests.mjs'))
      && /spawn\(selected\.command,\s*\[\s*\.\.\.selected\.args,\s*packageScript,\s*'--smoke'/.test(read('scripts/run-packaging-smoke.mjs'))
      && /commandRunner\(python\.command,\s*\[\s*\.\.\.python\.args,\s*packageScript,\s*'--output-dir'/.test(read('scripts/run-blender-smoke.mjs')),
  );

  const resolverImportProbe = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    'await import(' + JSON.stringify(pathToFileURL(path.join(root, resolverRelativePath)).href) + ')',
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  check(
    'shared Python resolver import is side-effect free',
    resolverImportProbe.status === 0
      && resolverImportProbe.stdout === ''
      && resolverImportProbe.stderr === '',
    [
      'status=' + String(resolverImportProbe.status),
      'signal=' + String(resolverImportProbe.signal),
      'error=' + (resolverImportProbe.error ? errorDetailForCheck(resolverImportProbe.error) : '<none>'),
      'stdout=' + JSON.stringify(resolverImportProbe.stdout),
      'stderr=' + JSON.stringify(resolverImportProbe.stderr),
    ].join('; '),
  );
  const consumerImportProbes = runtimeConsumers.map((relativePath) => ({
    relativePath,
    result: spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      'await import(' + JSON.stringify(pathToFileURL(path.join(root, relativePath)).href) + ')',
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    }),
  }));
  check(
    'all three shared Python resolver consumers import without CLI side effects',
    consumerImportProbes.every(({ result }) => (
      result.status === 0
        && result.stdout === ''
        && result.stderr === ''
    )),
    consumerImportProbes.map(({ relativePath, result }) => (
      relativePath
        + ': status=' + String(result.status)
        + '; signal=' + String(result.signal)
        + '; error=' + (result.error ? errorDetailForCheck(result.error) : '<none>')
        + '; stdout=' + JSON.stringify(result.stdout)
        + '; stderr=' + JSON.stringify(result.stderr)
    )).join(' | '),
  );

  const resolverRoot = path.resolve(tmpdir(), '__blueprints_python_resolver_fixture__');
  const windowsEnv = {
    HOME: 'Q:\\Wrong Home',
    PATH: 'R:\\fixture-bin',
    PYTHON: 'fixture-env-python',
    USERPROFILE: 'R:\\Fixture Home',
  };
  const windowsBundle = path.win32.join(
    windowsEnv.USERPROFILE,
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    'python.exe',
  );
  const orderedCalls = [];
  const orderedSelection = resolvePython({
    env: windowsEnv,
    exists: (candidate) => candidate === windowsBundle,
    platform: 'win32',
    root: resolverRoot,
    spawn: (command, args, options) => {
      orderedCalls.push({ args, command, options });
      return {
        error: null,
        signal: null,
        status: command === windowsBundle ? 0 : 1,
        stderr: '',
        stdout: '',
      };
    },
  });
  const expectedOrderedProbes = [
    { args: ['--version'], command: 'fixture-env-python' },
    { args: ['--version'], command: 'python3' },
    { args: ['--version'], command: 'python' },
    { args: ['-3', '--version'], command: 'py' },
    { args: ['--version'], command: windowsBundle },
  ];
  check(
    'shared Python resolver preserves candidate order, py prefix, bundled-last selection, and bounded no-shell options',
    JSON.stringify(orderedSelection) === JSON.stringify({ command: windowsBundle, args: [] })
      && JSON.stringify(orderedCalls.map(({ args, command }) => ({ args, command })))
        === JSON.stringify(expectedOrderedProbes)
      && orderedCalls.every(({ options }) => (
        options.cwd === resolverRoot
          && options.encoding === 'utf8'
          && options.env === windowsEnv
          && options.killSignal === 'SIGTERM'
          && options.shell === false
          && options.timeout === 30_000
          && options.windowsHide === true
      )),
  );

  const rawEnvCalls = [];
  const rawEnvCommand = 'R:\\Python With Spaces\\python.exe --literal';
  const rawEnvSelection = resolvePython({
    env: { PYTHON: rawEnvCommand },
    exists: () => false,
    platform: 'win32',
    root: resolverRoot,
    spawn: (command, args) => {
      rawEnvCalls.push({ args, command });
      return { error: null, signal: null, status: 0, stdout: 'Python 2.7.18', stderr: '' };
    },
  });
  check(
    'shared Python resolver keeps raw PYTHON priority and status-zero output compatibility',
    JSON.stringify(rawEnvSelection) === JSON.stringify({ command: rawEnvCommand, args: [] })
      && JSON.stringify(rawEnvCalls.map(({ args, command }) => [command, args]))
        === JSON.stringify([[rawEnvCommand, ['--version']]]),
  );

  const exhaustedCalls = [];
  const exhaustedEnv = { HOME: '/home/fixture', PYTHON: 'throws-python' };
  const posixBundle = path.posix.join(
    exhaustedEnv.HOME,
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    'bin/python',
  );
  const exhaustedOutcomes = [
    () => { throw new Error('fixture spawn throw'); },
    { error: Object.assign(new Error('fixture timeout'), { code: 'ETIMEDOUT' }), signal: null, status: null },
    { error: null, signal: 'SIGTERM', status: null },
    null,
    { error: null, signal: null, status: 1 },
  ];
  const exhaustedSelection = resolvePython({
    env: exhaustedEnv,
    exists: (candidate) => candidate === posixBundle,
    platform: 'linux',
    root: resolverRoot,
    spawn: (command, args) => {
      exhaustedCalls.push({ args, command });
      const outcome = exhaustedOutcomes[exhaustedCalls.length - 1];
      return typeof outcome === 'function' ? outcome() : outcome;
    },
  });
  check(
    'shared Python resolver controls throw, timeout error, signal, null result, nonzero status, and exhaustion',
    exhaustedSelection === null
      && JSON.stringify(exhaustedCalls.map(({ args, command }) => [command, args]))
        === JSON.stringify([
          ['throws-python', ['--version']],
          ['python3', ['--version']],
          ['python', ['--version']],
          ['py', ['-3', '--version']],
          [posixBundle, ['--version']],
        ]),
  );

  const abnormalZeroCalls = [];
  const abnormalZeroSelection = resolvePython({
    env: { PYTHON: 'error-with-zero' },
    exists: () => false,
    root: resolverRoot,
    spawn: (command, args) => {
      abnormalZeroCalls.push({ args, command });
      if (command === 'error-with-zero') return { error: new Error('fixture error'), signal: null, status: 0 };
      if (command === 'python3') return { error: null, signal: 'SIGTERM', status: 0 };
      if (command === 'python') return { error: null, signal: null, status: null };
      return { error: null, signal: null, status: 0 };
    },
  });
  check(
    'shared Python resolver rejects error, signal, and null status even when a status-zero field is present',
    JSON.stringify(abnormalZeroSelection) === JSON.stringify({ command: 'py', args: ['-3'] })
      && abnormalZeroCalls.length === 4,
  );

  const absentBundleCalls = [];
  let absentBundleCandidate = '';
  const absentBundleSelection = resolvePython({
    env: { HOME: '/home/absent' },
    exists: (candidate) => {
      absentBundleCandidate = candidate;
      return false;
    },
    platform: 'linux',
    root: resolverRoot,
    spawn: (command, args) => {
      absentBundleCalls.push({ args, command });
      return { error: null, signal: null, status: 1 };
    },
  });
  check(
    'shared Python resolver uses the POSIX bundled path and never probes it when absent',
    absentBundleSelection === null
      && absentBundleCandidate === '/home/absent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python'
      && absentBundleCalls.length === 3
      && absentBundleCalls.every(({ command }) => command !== absentBundleCandidate),
  );

  let noHomeExistsCalls = 0;
  let noHomeProbeCalls = 0;
  const noHomeSelection = resolvePython({
    env: {},
    exists: () => {
      noHomeExistsCalls += 1;
      return true;
    },
    root: resolverRoot,
    spawn: () => {
      noHomeProbeCalls += 1;
      return { error: null, signal: null, status: 1 };
    },
  });
  check(
    'shared Python resolver omits bundled discovery without USERPROFILE or HOME',
    noHomeSelection === null && noHomeExistsCalls === 0 && noHomeProbeCalls === 3,
  );

  let invalidOptionSpawnCalls = 0;
  const invalidOptionsRejected = [
    { root: '' },
    { timeoutMs: 0 },
    { timeoutMs: -1 },
    { timeoutMs: 1.5 },
    { timeoutMs: Number.MAX_SAFE_INTEGER + 1 },
  ].every((options) => {
    try {
      resolvePython({
        env: {},
        root: resolverRoot,
        spawn: () => {
          invalidOptionSpawnCalls += 1;
          return { status: 0 };
        },
        ...options,
      });
      return false;
    } catch (error) {
      return error instanceof TypeError;
    }
  });
  check(
    'shared Python resolver rejects empty roots and non-positive or fractional timeouts before spawn',
    invalidOptionsRejected && invalidOptionSpawnCalls === 0,
  );

  let throwingExistsProbeCalls = 0;
  const throwingExistsSelection = resolvePython({
    env: { HOME: '/home/throws' },
    exists: () => { throw new Error('fixture exists failure'); },
    platform: 'linux',
    root: resolverRoot,
    spawn: () => {
      throwingExistsProbeCalls += 1;
      return { error: null, signal: null, status: 1 };
    },
  });
  check(
    'shared Python resolver controls a bundled-path existence failure after standard candidates exhaust',
    throwingExistsSelection === null && throwingExistsProbeCalls === 3,
  );

  const packagingCalls = [];
  const packagingResolverInputs = [];
  const packagingEnv = { PATH: 'fixture-packaging-path' };
  const packagingStatus = runPackagingSmokeMain({
    env: packagingEnv,
    logger: { error: () => {} },
    pythonResolver: (options) => {
      packagingResolverInputs.push(options);
      return { command: 'fixture-launcher', args: ['-3'] };
    },
    root: resolverRoot,
    spawn: (command, args, options) => {
      packagingCalls.push({ args, command, options });
      return { error: null, signal: null, status: 0 };
    },
  });
  let packagingNullTaskCalls = 0;
  const packagingNullErrors = [];
  const packagingNullStatus = runPackagingSmokeMain({
    env: packagingEnv,
    logger: { error: (message) => packagingNullErrors.push(String(message)) },
    pythonResolver: () => null,
    root: resolverRoot,
    spawn: () => {
      packagingNullTaskCalls += 1;
      return { status: 0 };
    },
  });
  check(
    'packaging smoke forwards selected launcher args exactly and null selection starts no task process',
    packagingStatus === 0
      && packagingResolverInputs.length === 1
      && packagingResolverInputs[0].env === packagingEnv
      && packagingResolverInputs[0].root === resolverRoot
      && packagingCalls.length === 1
      && packagingCalls[0].command === 'fixture-launcher'
      && JSON.stringify(packagingCalls[0].args) === JSON.stringify([
        '-3',
        path.join(resolverRoot, 'scripts', 'package_release.py'),
        '--smoke',
      ])
      && packagingCalls[0].options.cwd === resolverRoot
      && packagingCalls[0].options.env.PATH === packagingEnv.PATH
      && packagingCalls[0].options.env.PYTHONDONTWRITEBYTECODE === '1'
      && packagingCalls[0].options.stdio === 'inherit'
      && packagingCalls[0].options.windowsHide === true
      && packagingNullStatus === 1
      && packagingNullTaskCalls === 0
      && packagingNullErrors.length === 1,
  );

  const blenderBuildCalls = [];
  const blenderResolverInputs = [];
  const blenderBuildEnv = { PATH: 'fixture-blender-build-path' };
  const blenderBuildOutput = path.join(resolverRoot, 'release');
  const blenderBuildStatus = runReleaseArtifactBuild(blenderBuildOutput, {
    commandRunner: (command, args, options) => {
      blenderBuildCalls.push({ args, command, options });
      return true;
    },
    env: blenderBuildEnv,
    logger: { error: () => {} },
    pythonResolver: (options) => {
      blenderResolverInputs.push(options);
      return { command: 'fixture-launcher', args: ['-3'] };
    },
  });
  let blenderNullTaskCalls = 0;
  const blenderNullErrors = [];
  const blenderNullStatus = runReleaseArtifactBuild(blenderBuildOutput, {
    commandRunner: () => {
      blenderNullTaskCalls += 1;
      return true;
    },
    env: blenderBuildEnv,
    logger: { error: (message) => blenderNullErrors.push(String(message)) },
    pythonResolver: () => null,
  });
  check(
    'Blender release build forwards selected launcher args exactly and null selection starts no task process',
    blenderBuildStatus === true
      && blenderResolverInputs.length === 1
      && blenderResolverInputs[0].env === blenderBuildEnv
      && blenderResolverInputs[0].root === root
      && blenderBuildCalls.length === 1
      && blenderBuildCalls[0].command === 'fixture-launcher'
      && JSON.stringify(blenderBuildCalls[0].args) === JSON.stringify([
        '-3',
        path.join(root, 'scripts', 'package_release.py'),
        '--output-dir',
        blenderBuildOutput,
        '--commit',
        'BLENDER-PACKAGED-SMOKE',
      ])
      && blenderBuildCalls[0].options.cwd === root
      && blenderBuildCalls[0].options.env.PATH === blenderBuildEnv.PATH
      && blenderBuildCalls[0].options.env.PYTHONDONTWRITEBYTECODE === '1'
      && blenderBuildCalls[0].options.label === 'release artifact build for Blender smoke'
      && blenderBuildCalls[0].options.timeoutMs === 60_000
      && blenderNullStatus === false
      && blenderNullTaskCalls === 0
      && blenderNullErrors.length === 1,
  );
}

if (exists('scripts/run-python-tests.mjs')) {
  const expectedPythonTestRoots = Object.freeze([
    'backend/tests',
    'blender_addon/tests',
  ]);
  const expectedPythonTestModules = Object.freeze([
    'backend/tests/test_cli.py',
    'backend/tests/test_job_contracts.py',
    'backend/tests/test_packaging.py',
    'backend/tests/test_svg_ids.py',
    'blender_addon/tests/test_bridge_unit.py',
    'blender_addon/tests/test_operator_flow.py',
    'blender_addon/tests/test_preview.py',
  ]);
  const fakeRoot = path.resolve(tmpdir(), '__blueprints_python_test_inventory_fixture__');
  const baselineTree = {
    '': { entries: ['backend', 'blender_addon'], type: 'directory' },
    backend: { entries: ['tests'], type: 'directory' },
    'backend/tests': {
      entries: ['fixtures', 'test_cli.py', 'test_job_contracts.py', 'test_packaging.py', 'test_svg_ids.py'],
      type: 'directory',
    },
    'backend/tests/fixtures': { entries: ['minimal_job.json'], type: 'directory' },
    'backend/tests/fixtures/minimal_job.json': { type: 'file' },
    'backend/tests/test_cli.py': { type: 'file' },
    'backend/tests/test_job_contracts.py': { type: 'file' },
    'backend/tests/test_packaging.py': { type: 'file' },
    'backend/tests/test_svg_ids.py': { type: 'file' },
    blender_addon: { entries: ['tests'], type: 'directory' },
    'blender_addon/tests': {
      entries: [
        'smoke_blender_bridge.py',
        'smoke_blender_packaged.py',
        'test_bridge_unit.py',
        'test_operator_flow.py',
        'test_preview.py',
      ],
      type: 'directory',
    },
    'blender_addon/tests/smoke_blender_bridge.py': { type: 'file' },
    'blender_addon/tests/smoke_blender_packaged.py': { type: 'file' },
    'blender_addon/tests/test_bridge_unit.py': { type: 'file' },
    'blender_addon/tests/test_operator_flow.py': { type: 'file' },
    'blender_addon/tests/test_preview.py': { type: 'file' },
  };
  const inventoryForTree = (tree, options = {}) => inspectPythonTestInventory({
    fsApi: fakeFilesystem(fakeRoot, tree),
    root: fakeRoot,
    ...options,
  });
  const fixtureLogger = () => {
    const errors = [];
    return { errors, logger: { error: (message) => errors.push(String(message)) } };
  };
  const runnerRejectsBeforeSpawn = (tree) => {
    let spawnCalls = 0;
    const output = fixtureLogger();
    const status = runPythonTestsMain({
      env: { PYTHON: 'fixture-python' },
      fsApi: fakeFilesystem(fakeRoot, tree),
      logger: output.logger,
      root: fakeRoot,
      spawn: () => {
        spawnCalls += 1;
        return { status: 0 };
      },
    });
    return status === 1 && spawnCalls === 0 && output.errors.length > 0;
  };

  check(
    'Python test runner owns the exact ordered test-root contract',
    JSON.stringify(PYTHON_TEST_ROOTS) === JSON.stringify(expectedPythonTestRoots),
  );
  check(
    'Python test runner owns the exact ordered module allowlist',
    JSON.stringify(PYTHON_TEST_MODULES) === JSON.stringify(expectedPythonTestModules),
  );

  const liveInventory = inspectPythonTestInventory({ root });
  check(
    'Python test inventory matches the live repository exactly and remains nonzero',
    liveInventory.diagnostics.length === 0
      && JSON.stringify(liveInventory.files) === JSON.stringify(expectedPythonTestModules),
    liveInventory.diagnostics.map((item) => `${item.operation}:${item.path}:${item.detail}`).join('; '),
  );

  const baselineInventory = inventoryForTree(clone(baselineTree));
  check(
    'Python test inventory accepts the isolated exact baseline while excluding Blender smoke files',
    baselineInventory.diagnostics.length === 0
      && JSON.stringify(baselineInventory.files) === JSON.stringify(expectedPythonTestModules),
  );

  for (const modulePath of expectedPythonTestModules) {
    const deletedTree = clone(baselineTree);
    const suiteRoot = expectedPythonTestRoots.find((candidate) => modulePath.startsWith(`${candidate}/`));
    const fileName = path.posix.basename(modulePath);
    deletedTree[suiteRoot].entries = deletedTree[suiteRoot].entries.filter((entry) => entry !== fileName);
    delete deletedTree[modulePath];
    const deletion = inventoryForTree(deletedTree);
    let spawnCalls = 0;
    const output = fixtureLogger();
    const status = runPythonTestsMain({
      env: { PYTHON: 'fixture-python' },
      fsApi: fakeFilesystem(fakeRoot, deletedTree),
      logger: output.logger,
      root: fakeRoot,
      spawn: () => {
        spawnCalls += 1;
        return { status: 0 };
      },
    });
    check(
      `Python test deletion fixture fails before spawn: ${modulePath}`,
      deletion.diagnostics.some((item) => (
        item.operation === 'inventory'
          && item.path === modulePath
          && /required Python test module is missing/.test(item.detail)
      ))
        && status === 1
        && spawnCalls === 0
        && output.errors.some((message) => message.includes(modulePath)),
      deletion.diagnostics.map((item) => `${item.operation}:${item.path}:${item.detail}`).join('; '),
    );
  }

  const additiveTree = clone(baselineTree);
  additiveTree['backend/tests'].entries.push('test_unapproved.py');
  additiveTree['backend/tests/test_unapproved.py'] = { type: 'file' };
  const additive = inventoryForTree(additiveTree);
  check(
    'Python test inventory rejects an additive test_*.py module',
    additive.diagnostics.some((item) => (
      item.path === 'backend/tests/test_unapproved.py'
        && /unexpected Python test module/.test(item.detail)
    )) && runnerRejectsBeforeSpawn(additiveTree),
  );

  const nestedTree = clone(baselineTree);
  nestedTree['backend/tests'].entries.push('nested');
  nestedTree['backend/tests/nested'] = { entries: ['test_hidden.py'], type: 'directory' };
  nestedTree['backend/tests/nested/test_hidden.py'] = { type: 'file' };
  const nested = inventoryForTree(nestedTree);
  check(
    'Python test inventory rejects a nested unapproved test module',
    nested.diagnostics.some((item) => item.path === 'backend/tests/nested/test_hidden.py')
      && runnerRejectsBeforeSpawn(nestedTree),
  );

  const renamedTree = clone(baselineTree);
  renamedTree['blender_addon/tests'].entries = renamedTree['blender_addon/tests'].entries
    .filter((entry) => entry !== 'test_preview.py');
  renamedTree['blender_addon/tests'].entries.push('test_preview_renamed.py');
  delete renamedTree['blender_addon/tests/test_preview.py'];
  renamedTree['blender_addon/tests/test_preview_renamed.py'] = { type: 'file' };
  const renamed = inventoryForTree(renamedTree);
  check(
    'Python test inventory rejects a renamed required module as missing plus unexpected',
    renamed.diagnostics.some((item) => item.path === 'blender_addon/tests/test_preview.py' && /missing/.test(item.detail))
      && renamed.diagnostics.some((item) => item.path === 'blender_addon/tests/test_preview_renamed.py' && /unexpected/.test(item.detail))
      && runnerRejectsBeforeSpawn(renamedTree),
  );

  const caseAliasTree = clone(baselineTree);
  caseAliasTree['blender_addon/tests'].entries = caseAliasTree['blender_addon/tests'].entries
    .filter((entry) => entry !== 'test_preview.py');
  caseAliasTree['blender_addon/tests'].entries.push('TEST_preview.PY');
  delete caseAliasTree['blender_addon/tests/test_preview.py'];
  caseAliasTree['blender_addon/tests/TEST_preview.PY'] = { type: 'file' };
  const caseAlias = inventoryForTree(caseAliasTree);
  check(
    'Python test inventory rejects platform-dependent case aliases',
    caseAlias.diagnostics.some((item) => item.path === 'blender_addon/tests/test_preview.py' && /missing/.test(item.detail))
      && caseAlias.diagnostics.some((item) => item.path === 'blender_addon/tests/TEST_preview.PY' && /unexpected/.test(item.detail))
      && runnerRejectsBeforeSpawn(caseAliasTree),
  );

  const zeroTree = clone(baselineTree);
  for (const suiteRoot of expectedPythonTestRoots) {
    zeroTree[suiteRoot].entries = zeroTree[suiteRoot].entries.filter((entry) => !/^test_.*\.py$/i.test(entry));
  }
  for (const modulePath of expectedPythonTestModules) delete zeroTree[modulePath];
  const zero = inventoryForTree(zeroTree);
  check(
    'Python test inventory rejects zero discovery in each required root',
    expectedPythonTestRoots.every((suiteRoot) => zero.diagnostics.some((item) => (
      item.operation === 'inventory'
        && item.path === suiteRoot
        && /no test_\*\.py modules/.test(item.detail)
    ))) && runnerRejectsBeforeSpawn(zeroTree),
  );

  const missingRootTree = clone(baselineTree);
  delete missingRootTree['backend/tests'];
  const missingRoot = inventoryForTree(missingRootTree);
  check(
    'Python test inventory fails closed on a missing required root',
    missingRoot.diagnostics.some((item) => item.operation === 'lstat' && item.path === 'backend/tests')
      && runnerRejectsBeforeSpawn(missingRootTree),
  );

  const fileRootTree = clone(baselineTree);
  fileRootTree['backend/tests'] = { type: 'file' };
  const fileRoot = inventoryForTree(fileRootTree);
  check(
    'Python test inventory requires every configured root to be a directory',
    fileRoot.diagnostics.some((item) => /required Python test root(?: path component)? must be a directory/.test(item.detail))
      && runnerRejectsBeforeSpawn(fileRootTree),
  );

  const unreadableTree = clone(baselineTree);
  unreadableTree['backend/tests'].readdirError = 'permission denied';
  const unreadable = inventoryForTree(unreadableTree);
  check(
    'Python test inventory fails closed on an unreadable required root',
    unreadable.diagnostics.some((item) => item.operation === 'readdir' && item.path === 'backend/tests')
      && runnerRejectsBeforeSpawn(unreadableTree),
  );

  const symlinkRootTree = clone(baselineTree);
  symlinkRootTree['backend/tests'].type = 'symlink';
  const symlinkRoot = inventoryForTree(symlinkRootTree);
  check(
    'Python test inventory rejects a symlinked or junction-backed required root before spawn',
    symlinkRoot.diagnostics.some((item) => (
      item.operation === 'lstat'
        && item.path === 'backend/tests'
        && /symbolic links and junctions/.test(item.detail)
    )) && runnerRejectsBeforeSpawn(symlinkRootTree),
  );

  const symlinkTree = clone(baselineTree);
  symlinkTree['backend/tests/test_cli.py'].type = 'symlink';
  const symlink = inventoryForTree(symlinkTree);
  check(
    'Python test inventory rejects symlink or junction entries',
    symlink.diagnostics.some((item) => /symbolic links and junctions/.test(item.detail))
      && symlink.diagnostics.some((item) => item.path === 'backend/tests/test_cli.py' && /missing/.test(item.detail))
      && runnerRejectsBeforeSpawn(symlinkTree),
  );

  const wrongTypeTree = clone(baselineTree);
  wrongTypeTree['backend/tests/test_cli.py'] = { entries: [], type: 'directory' };
  const wrongType = inventoryForTree(wrongTypeTree);
  check(
    'Python test inventory rejects an allowlisted module that is not a regular file',
    wrongType.diagnostics.some((item) => /test module path must be a regular file/.test(item.detail))
      && runnerRejectsBeforeSpawn(wrongTypeTree),
  );

  const unsupportedTree = clone(baselineTree);
  unsupportedTree['backend/tests/fixtures'].entries.push('device');
  unsupportedTree['backend/tests/fixtures/device'] = { type: 'unknown' };
  const unsupported = inventoryForTree(unsupportedTree);
  check(
    'Python test inventory rejects unsupported filesystem entry types',
    unsupported.diagnostics.some((item) => /unsupported filesystem entry type/.test(item.detail))
      && runnerRejectsBeforeSpawn(unsupportedTree),
  );

  const packageTree = clone(baselineTree);
  packageTree['backend/tests'].entries.push('nested_package');
  packageTree['backend/tests/nested_package'] = { entries: ['__init__.py'], type: 'directory' };
  packageTree['backend/tests/nested_package/__init__.py'] = { type: 'file' };
  const packageMarker = inventoryForTree(packageTree);
  check(
    'Python test inventory rejects nested unittest discovery package markers',
    packageMarker.diagnostics.some((item) => (
      item.path === 'backend/tests/nested_package/__init__.py'
        && /package markers are not allowed/.test(item.detail)
    )) && runnerRejectsBeforeSpawn(packageTree),
  );

  const rootCaseTree = clone(baselineTree);
  rootCaseTree.backend.entries = ['Tests'];
  const rootCase = inventoryForTree(rootCaseTree);
  check(
    'Python test inventory rejects required-root case aliases before traversal',
    rootCase.diagnostics.some((item) => item.operation === 'spelling' && item.path === 'backend/tests')
      && runnerRejectsBeforeSpawn(rootCaseTree),
  );

  const duplicateTree = clone(baselineTree);
  duplicateTree['backend/tests'].entries.push('test_cli.py');
  const duplicate = inventoryForTree(duplicateTree);
  check(
    'Python test inventory rejects duplicate discovered module paths before spawn',
    duplicate.diagnostics.some((item) => (
      item.path === 'backend/tests/test_cli.py'
        && /duplicate Python test module/.test(item.detail)
    )) && runnerRejectsBeforeSpawn(duplicateTree),
  );

  for (const [name, options] of [
    ['reordered module allowlist', { expectedModules: [...expectedPythonTestModules].reverse() }],
    ['duplicate module allowlist', { expectedModules: [...expectedPythonTestModules, expectedPythonTestModules.at(-1)] }],
    ['empty module allowlist', { expectedModules: [] }],
    ['reordered test roots', { roots: [...expectedPythonTestRoots].reverse() }],
    ['duplicate test roots', { roots: [...expectedPythonTestRoots, expectedPythonTestRoots.at(-1)] }],
    ['empty test roots', { roots: [] }],
    ['escaping test root', { roots: ['../outside', ...expectedPythonTestRoots] }],
    ['backslash module path', { expectedModules: ['backend\\tests\\test_cli.py', ...expectedPythonTestModules.slice(1)] }],
    ['dot-prefixed module path', { expectedModules: ['./backend/tests/test_cli.py', ...expectedPythonTestModules.slice(1)] }],
    ['dot-segment module path', { expectedModules: ['backend/tests/../tests/test_cli.py', ...expectedPythonTestModules.slice(1)] }],
    ['repeated-separator module path', { expectedModules: ['backend//tests/test_cli.py', ...expectedPythonTestModules.slice(1)] }],
    ['Windows drive test root', { roots: ['C:/outside', ...expectedPythonTestRoots] }],
    ['UNC test root', { roots: ['//server/share', ...expectedPythonTestRoots] }],
  ]) {
    const contractFailure = inventoryForTree(clone(baselineTree), options);
    check(
      `Python test inventory rejects ${name}`,
      contractFailure.diagnostics.some((item) => item.operation === 'contract'),
    );
  }

  const importProbe = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `await import(${JSON.stringify(pathToFileURL(path.join(root, 'scripts', 'run-python-tests.mjs')).href)})`,
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  check(
    'Python test runner import is side-effect free',
    importProbe.status === 0 && importProbe.stdout === '' && importProbe.stderr === '',
    [
      `status=${String(importProbe.status)}`,
      `signal=${String(importProbe.signal)}`,
      `error=${importProbe.error ? errorDetailForCheck(importProbe.error) : '<none>'}`,
      `stdout=${JSON.stringify(importProbe.stdout)}`,
      `stderr=${JSON.stringify(importProbe.stderr)}`,
    ].join('; '),
  );

  const baselineCalls = [];
  const baselineOutput = fixtureLogger();
  const baselineStatus = runPythonTestsMain({
    env: { PYTHON: 'fixture-python' },
    fsApi: fakeFilesystem(fakeRoot, clone(baselineTree)),
    logger: baselineOutput.logger,
    root: fakeRoot,
    spawn: (command, args, options) => {
      baselineCalls.push({ args, command, options });
      return { status: 0 };
    },
  });
  check(
    'Python test runner probes once then runs both approved unittest discovery suites in order',
    baselineStatus === 0
      && baselineOutput.errors.length === 0
      && baselineCalls.length === 3
      && baselineCalls[0].command === 'fixture-python'
      && JSON.stringify(baselineCalls[0].args) === JSON.stringify(['--version'])
      && JSON.stringify(baselineCalls[1].args) === JSON.stringify(['-m', 'unittest', 'discover', '-s', 'backend/tests', '-p', 'test_*.py'])
      && JSON.stringify(baselineCalls[2].args) === JSON.stringify(['-m', 'unittest', 'discover', '-s', 'blender_addon/tests', '-p', 'test_*.py'])
      && baselineCalls.every((call) => call.options.cwd === fakeRoot && call.options.windowsHide === true)
      && baselineCalls[0].options.env.PYTHON === 'fixture-python'
      && baselineCalls[0].options.killSignal === 'SIGTERM'
      && baselineCalls[0].options.shell === false
      && baselineCalls[0].options.timeout === 30_000
      && !Object.hasOwn(baselineCalls[1].options, 'timeout')
      && !Object.hasOwn(baselineCalls[2].options, 'timeout'),
  );

  const launcherCalls = [];
  const launcherOutput = fixtureLogger();
  const launcherStatus = runPythonTestsMain({
    env: {},
    fsApi: fakeFilesystem(fakeRoot, clone(baselineTree)),
    logger: launcherOutput.logger,
    root: fakeRoot,
    spawn: (command, args, options) => {
      launcherCalls.push({ args, command, options });
      if (args.at(-1) === '--version') {
        return { error: null, signal: null, status: command === 'py' ? 0 : 1 };
      }
      return { error: null, signal: null, status: 0 };
    },
  });
  const launcherTaskCalls = launcherCalls.filter(({ args }) => args.includes('-m'));
  check(
    'Python test runner forwards py launcher args to both unittest task processes',
    launcherStatus === 0
      && launcherOutput.errors.length === 0
      && JSON.stringify(launcherCalls.slice(0, 3).map(({ args, command }) => [command, args]))
        === JSON.stringify([
          ['python3', ['--version']],
          ['python', ['--version']],
          ['py', ['-3', '--version']],
        ])
      && launcherTaskCalls.length === 2
      && launcherTaskCalls.every(({ args, command, options }) => (
        command === 'py'
          && args[0] === '-3'
          && args[1] === '-m'
          && options.cwd === fakeRoot
          && !Object.hasOwn(options, 'timeout')
      )),
  );

  const noInterpreterCalls = [];
  const noInterpreterOutput = fixtureLogger();
  const noInterpreterStatus = runPythonTestsMain({
    env: {},
    fsApi: fakeFilesystem(fakeRoot, clone(baselineTree)),
    logger: noInterpreterOutput.logger,
    root: fakeRoot,
    spawn: (command, args) => {
      noInterpreterCalls.push({ args, command });
      return { error: null, signal: null, status: 1 };
    },
  });
  check(
    'Python test runner starts no unittest task process when resolver selection is null',
    noInterpreterStatus === 1
      && noInterpreterCalls.length === 3
      && noInterpreterCalls.every(({ args }) => args.at(-1) === '--version')
      && noInterpreterOutput.errors.length === 1
      && /Python interpreter not found/.test(noInterpreterOutput.errors[0]),
  );

  const failureCalls = [];
  const failureOutput = fixtureLogger();
  const failureStatus = runPythonTestsMain({
    env: { PYTHON: 'fixture-python' },
    fsApi: fakeFilesystem(fakeRoot, clone(baselineTree)),
    logger: failureOutput.logger,
    root: fakeRoot,
    spawn: (_command, args) => {
      failureCalls.push(args);
      if (args.includes('backend/tests')) return { status: 1 };
      return { status: 0 };
    },
  });
  check(
    'Python test runner preserves both-suite execution and propagates a suite failure',
    failureStatus === 1
      && failureCalls.length === 3
      && failureCalls.some((args) => args.includes('backend/tests'))
      && failureCalls.some((args) => args.includes('blender_addon/tests')),
  );
}

if (exists('scripts/run-packaging-smoke.mjs')) {
  const packagingSmoke = read('scripts/run-packaging-smoke.mjs');
  check('packaging smoke resolves repo root from script path', /fileURLToPath\(import\.meta\.url\)/.test(packagingSmoke));
  check('packaging smoke invokes package_release.py smoke mode', /package_release\.py/.test(packagingSmoke) && /--smoke/.test(packagingSmoke));
  check('packaging smoke hides Windows process windows', /windowsHide:\s*true/.test(packagingSmoke));
}

if (exists('scripts/package_release.py')) {
  const packageRelease = read('scripts/package_release.py');
  check('package release resolves repo root from script path', /Path\(__file__\)\.resolve\(\)\.parents\[1\]/.test(packageRelease));
  check('package release writes add-on zip', /blender_addon_zip/.test(packageRelease) && /blueprints_addon/.test(packageRelease));
  check('package release writes backend bundle zip', /backend_bundle_zip/.test(packageRelease) && /blueprints_backend/.test(packageRelease));
  check('package release writes manifest', /release_manifest\.json/.test(packageRelease));
  check('package release excludes Python cache files', /__pycache__/.test(packageRelease) && /\.pyc/.test(packageRelease));
  check('package release uses stdlib zipfile', /import zipfile/.test(packageRelease) && !/pip|poetry|pyinstaller|nuitka|briefcase/i.test(packageRelease));
  check(
    'package release reads each component version from its canonical owner',
    /package_version\s*=\s*json\.loads\([\s\S]*?package\.json/.test(packageRelease)
      && /addon_version\s*=\s*read_bl_info_version\([\s\S]*?blueprints_addon[\s\S]*?__init__\.py/.test(packageRelease)
      && /backend_version\s*=\s*read_backend_version\([\s\S]*?blueprints_backend[\s\S]*?__init__\.py/.test(packageRelease),
  );
  check(
    'release manifest projects independent canonical component versions',
    /"package_version": package_version/.test(packageRelease)
      && /"id": "blender_addon_zip"[\s\S]*?"version": addon_version/.test(packageRelease)
      && /"id": "backend_bundle_zip"[\s\S]*?"version": backend_version/.test(packageRelease),
  );
  check(
    'release manifest data schema remains 1.0',
    /"schema_version":\s*"1\.0"/.test(packageRelease),
  );
}

if (exists('.gitignore')) {
  const gitignore = read('.gitignore');
  check('gitignore blocks bridge job folders', /blueprints-job-\*\//.test(gitignore));
  check('gitignore blocks bridge OBJ GLB outputs', /\*\.obj/.test(gitignore) && /\*\.glb/.test(gitignore) && /\*\.gltf/.test(gitignore));
  check('gitignore blocks root release packaging artifacts', /^\/dist\/$/m.test(gitignore) && /^\/release\/$/m.test(gitignore) && /\*\.zip/.test(gitignore));
}

if (exists('scripts/install-hooks.mjs')) {
  {
    const winPath = path.win32;
    const aliasContainer = 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\blueprints-native-hooks-alias';
    const longContainer = 'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\blueprints-native-hooks-alias';
    const aliasOptions = {
      pathApi: winPath,
      realpathNative(candidate) {
        const resolved = winPath.resolve(candidate);
        if (resolved === winPath.resolve(aliasContainer)) return longContainer;
        if (resolved === winPath.resolve(longContainer)) return longContainer;
        throw Object.assign(new Error(`missing fixture path: ${resolved}`), { code: 'ENOENT' });
      },
    };
    const aliasMissingTail = winPath.join(aliasContainer, 'repo', '.git', 'hooks');
    const longMissingTail = winPath.join(longContainer, 'repo', '.git', 'hooks');
    check(
      'native Git hook fixture canonicalizes Windows 8.3 aliases with a missing tail',
      canonicalFixturePath(aliasMissingTail, aliasOptions) === longMissingTail
        && fixturePathIsConfined(aliasContainer, longMissingTail, aliasOptions),
    );

    let deniedError = null;
    try {
      canonicalFixturePath(aliasMissingTail, {
        pathApi: winPath,
        realpathNative() {
          throw Object.assign(new Error('access denied'), { code: 'EACCES' });
        },
      });
    } catch (error) {
      deniedError = error;
    }
    check(
      'native Git hook fixture canonicalization fails closed outside ENOENT',
      deniedError?.code === 'EACCES',
    );
  }

  {
    const canonicalTempRoot = canonicalFixturePath(tmpdir());
    let confinedContainer = null;
    let externalContainer = null;
    try {
      confinedContainer = canonicalFixturePath(
        mkdtempSync(path.join(canonicalTempRoot, 'blueprints-native-hooks-confined-')),
      );
      externalContainer = canonicalFixturePath(
        mkdtempSync(path.join(canonicalTempRoot, 'blueprints-native-hooks-external-')),
      );
      const externalExisting = path.join(externalContainer, 'hooks');
      const externalMissingTail = path.join(externalContainer, 'missing', 'hooks');
      mkdirSync(externalExisting);
      const context = { container: confinedContainer };
      const rejects = [externalExisting, externalMissingTail].map((candidate) => {
        try {
          assertFixtureHooksPathConfined(context, `${candidate}\n`);
          return false;
        } catch (error) {
          return /escaped its container/.test(error.message);
        }
      });
      check(
        'native Git hook fixture rejects real existing and missing-tail external escapes',
        rejects.every(Boolean),
      );
    } catch (error) {
      check('native Git hook external-escape regression completes', false, errorDetailForCheck(error));
    } finally {
      for (const container of [externalContainer, confinedContainer]) {
        if (!container) continue;
        try {
          cleanupNativeHookFixture(container);
        } catch (error) {
          check('native Git hook external-escape regression cleanup', false, errorDetailForCheck(error));
        }
      }
    }
  }

  const errors = nativeHookContractErrors(NATIVE_HOOKS);
  check('native Git hook installer has the exact pre-commit and pre-push contract', errors.length === 0, errors.join('; '));
  for (const [name, mutant] of [
    [
      'pre-commit command drift',
      NATIVE_HOOKS.map((entry) => (
        entry.name === 'pre-commit' ? { ...entry, command: 'npm run verify' } : entry
      )),
    ],
    [
      'pre-push command drift',
      NATIVE_HOOKS.map((entry) => (
        entry.name === 'pre-push' ? { ...entry, command: 'npm run quality:deep' } : entry
      )),
    ],
    ['additive entries', [...NATIVE_HOOKS, { name: 'post-commit', command: 'npm run verify' }]],
    ['deleted entries', NATIVE_HOOKS.slice(0, 1)],
    ['reordered entries', [...NATIVE_HOOKS].reverse()],
  ]) {
    let fsAccesses = 0;
    let spawnCalls = 0;
    const mutationTrapFs = new Proxy({}, {
      get() {
        fsAccesses += 1;
        throw new Error('mutant reached filesystem');
      },
    });
    const failure = expectInstallerFailure(
      () => installNativeHooksCore({
        fsApi: mutationTrapFs,
        hooks: mutant,
        root,
        spawn() {
          spawnCalls += 1;
          throw new Error('mutant reached Git process');
        },
      }),
      /exact managed hook contract/,
    );
    check(
      `native Git hook production boundary rejects ${name} before mutation`,
      nativeHookContractErrors(mutant).length > 0
        && failure.threw
        && fsAccesses === 0
        && spawnCalls === 0,
      failure.message,
    );
  }
  for (const { name, command } of expectedNativeHooks) {
    check(
      `native Git hook body is independently exact: ${name}`,
      nativeHookBody(command) === expectedNativeHookBody(command),
    );
    check(
      `legacy native Git hook body is independently exact: ${name}`,
      legacyNativeHookBody(command) === expectedNativeHookBody(command, { legacy: true }),
    );
  }

  let liveHooksDir = null;
  let liveHookSentinel = null;
  try {
    liveHooksDir = resolveActiveHooksDirectory({ root });
    liveHookSentinel = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(liveHooksDir, name))
    ));
    check('native Git hook live sentinel was captured read-only', true);
  } catch (error) {
    check('native Git hook live sentinel was captured read-only', false, errorDetailForCheck(error));
  }

  const fakeHooksDir = path.join(root, '.git', 'hooks');
  const successfulResolver = resolverSpawn(root, fakeHooksDir);
  let fakeResolved = '';
  try {
    fakeResolved = resolveActiveHooksDirectory({ root, spawn: successfulResolver.spawn });
  } catch {
    fakeResolved = '';
  }
  check(
    'native Git hook resolver accepts its exact process baseline',
    sameFixturePath(fakeResolved, fakeHooksDir),
  );
  check(
    'native Git hook resolver invokes bounded no-shell root active and lexical probes',
    successfulResolver.calls.length === 3
      && successfulResolver.calls.every((call) => (
        call.command === 'git'
          && call.options.cwd === path.resolve(root)
          && call.options.encoding === 'utf8'
          && call.options.killSignal === 'SIGTERM'
          && call.options.timeout === 10_000
          && call.options.windowsHide === true
          && call.options.shell === undefined
      ))
      && JSON.stringify(successfulResolver.calls[0].args) === JSON.stringify([
        'rev-parse', '--show-toplevel',
      ])
      && JSON.stringify(successfulResolver.calls[1].args) === JSON.stringify([
        'rev-parse', '--path-format=absolute', '--git-path', 'hooks',
      ])
      && JSON.stringify(successfulResolver.calls[2].args) === JSON.stringify([
        'rev-parse', '--git-path', 'hooks',
      ]),
  );

  for (const [name, result] of [
    ['spawn error', { error: Object.assign(new Error('missing git'), { code: 'ENOENT' }), signal: null, status: null, stderr: '', stdout: '' }],
    ['timeout', { error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), signal: null, status: null, stderr: '', stdout: '' }],
    ['signal', { error: null, signal: 'SIGTERM', status: null, stderr: '', stdout: '' }],
    ['null status', { error: null, signal: null, status: null, stderr: '', stdout: '' }],
    ['nonzero status', { error: null, signal: null, status: 128, stderr: 'not a repository', stdout: '' }],
    ['success stderr', { error: null, signal: null, status: 0, stderr: 'warning', stdout: `${fakeHooksDir}\n` }],
    ['empty stdout', { error: null, signal: null, status: 0, stderr: '', stdout: '' }],
    ['multiple paths', { error: null, signal: null, status: 0, stderr: '', stdout: `${fakeHooksDir}\n${fakeHooksDir}\n` }],
    ['relative path', { error: null, signal: null, status: 0, stderr: '', stdout: '.git/hooks\n' }],
  ]) {
    const fixture = resolverSpawn(root, fakeHooksDir, result);
    check(
      `native Git hook resolver rejects ${name}`,
      expectInstallerFailure(() => resolveActiveHooksDirectory({ root, spawn: fixture.spawn })).threw,
    );
  }
  check(
    'native Git hook resolver rejects a thrown process exception',
    expectInstallerFailure(() => resolveActiveHooksDirectory({
      root,
      spawn() { throw Object.assign(new Error('spawn threw'), { code: 'EACCES' }); },
    })).threw,
  );
  const wrongRootResolver = resolverSpawn(path.join(root, 'nested'), fakeHooksDir);
  check(
    'native Git hook resolver rejects a parent or wrong repository root',
    expectInstallerFailure(() => resolveActiveHooksDirectory({
      root,
      spawn: wrongRootResolver.spawn,
    }), /intended repository root/).threw,
  );
  let lexicalMismatchCall = 0;
  const lexicalMismatchSpawn = () => {
    lexicalMismatchCall += 1;
    const stdout = lexicalMismatchCall === 1
      ? `${root}\n`
      : lexicalMismatchCall === 2
        ? `${fakeHooksDir}\n`
        : `${path.join(root, 'redirected-hooks')}\n`;
    return { error: null, signal: null, status: 0, stderr: '', stdout };
  };
  check(
    'native Git hook resolver rejects a deterministic lexical-active path mismatch',
    expectInstallerFailure(() => resolveActiveHooksDirectory({
      root,
      spawn: lexicalMismatchSpawn,
    }), /reparse redirect/).threw
      && lexicalMismatchCall === 3,
  );

  const ambientEscapeContainer = mkdtempSync(path.join(tmpdir(), 'blueprints-native-hooks-escape-'));
  try {
    const ambientHooksDir = path.join(ambientEscapeContainer, 'ambient hooks');
    const ambientTemplateDir = path.join(ambientEscapeContainer, 'ambient template');
    const ambientTemplateHooks = path.join(ambientTemplateDir, 'hooks');
    const ambientGlobalConfig = path.join(ambientEscapeContainer, 'ambient.gitconfig');
    const escapeSentinel = path.join(ambientHooksDir, 'sentinel.txt');
    mkdirSync(ambientHooksDir);
    mkdirSync(ambientTemplateHooks, { recursive: true });
    writeFileSync(escapeSentinel, 'external fixture sentinel', 'utf8');
    writeFileSync(
      path.join(ambientTemplateHooks, 'pre-commit'),
      '#!/bin/sh\necho hostile-template\n',
      'utf8',
    );
    writeFileSync(
      ambientGlobalConfig,
      `[core]\n\thooksPath = "${ambientHooksDir.replace(/\\/g, '/')}"\n`,
      'utf8',
    );
    const escapeManifestBefore = nativeHookDirectoryManifest(ambientHooksDir);
    withNativeHookFixture(
      'hostile-ambient-isolation',
      ({ container, gitEnv, repo }) => {
        const activeHooksDir = resolveActiveHooksDirectory({ root: repo });
        const result = installNativeHooks({ root: repo });
        const controlledKeys = new Set([
          'GCM_INTERACTIVE',
          'GIT_CONFIG_COUNT',
          'GIT_CONFIG_GLOBAL',
          'GIT_CONFIG_NOSYSTEM',
          'GIT_TEMPLATE_DIR',
          'GIT_TERMINAL_PROMPT',
        ]);
        const leakedConfigKeys = Object.keys(gitEnv).filter((key) => {
          const upper = key.toUpperCase();
          return /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(upper)
            || (controlledKeys.has(upper) && key !== upper);
        });
        check(
          'native Git hook fixtures isolate hostile global system env and template configuration',
          gitEnv.GIT_CONFIG_COUNT === '0'
            && gitEnv.GIT_CONFIG_NOSYSTEM === '1'
            && leakedConfigKeys.length === 0
            && sameFixturePath(gitEnv.GIT_CONFIG_GLOBAL, path.join(container, 'isolated-global.gitconfig'))
            && sameFixturePath(gitEnv.GIT_TEMPLATE_DIR, path.join(container, 'isolated-template'))
            && sameFixturePath(activeHooksDir, path.join(repo, '.git', 'hooks'))
            && sameFixturePath(result.hooksDir, activeHooksDir)
            && installedHookErrors(activeHooksDir).length === 0
            && !existsSync(path.join(repo, '.git', 'hooks', 'pre-commit.sample'))
            && JSON.stringify(nativeHookDirectoryManifest(ambientHooksDir)) === JSON.stringify(escapeManifestBefore)
            && readFileSync(escapeSentinel, 'utf8') === 'external fixture sentinel',
        );
      },
      {
        baseEnvFactory: () => ({
          ...process.env,
          git_config_count: '1',
          git_config_global: ambientGlobalConfig,
          git_config_key_0: 'core.hooksPath',
          git_config_value_0: ambientHooksDir,
          git_dir: path.join(ambientEscapeContainer, 'ambient.git'),
          git_template_dir: ambientTemplateDir,
          git_work_tree: ambientEscapeContainer,
        }),
      },
    );
  } finally {
    cleanupNativeHookFixture(ambientEscapeContainer);
  }

  withNativeHookFixture('normal-cli', ({ gitEnv, repo }) => {
    const scriptsDir = path.join(repo, 'scripts');
    const copiedInstaller = path.join(scriptsDir, 'install-hooks.mjs');
    mkdirSync(scriptsDir);
    mkdirSync(path.join(scriptsDir, 'lib'));
    copyFileSync(path.join(root, 'scripts', 'install-hooks.mjs'), copiedInstaller);
    copyFileSync(
      path.join(root, 'scripts', 'lib', 'native-hook-installer.mjs'),
      path.join(scriptsDir, 'lib', 'native-hook-installer.mjs'),
    );
    const activeHooksDir = path.resolve(runFixtureGit(
      repo,
      ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
    ));
    const beforeImport = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(activeHooksDir, name))
    ));
    const importResult = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(pathToFileURL(copiedInstaller).href)})`,
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        env: gitEnv,
        killSignal: 'SIGTERM',
        timeout: 10_000,
        windowsHide: true,
      },
    );
    const afterImport = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(activeHooksDir, name))
    ));
    check(
      'native Git hook installer import is side-effect free',
      importResult.status === 0
        && importResult.signal === null
        && !importResult.error
        && importResult.stdout === ''
        && importResult.stderr === ''
        && JSON.stringify(afterImport) === JSON.stringify(beforeImport),
    );
    const invalidRootResult = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `const module = await import(${JSON.stringify(pathToFileURL(copiedInstaller).href)});`,
          "for (const root of ['', null]) {",
          '  let rejected = false;',
          '  try { module.main({ root }); } catch { rejected = true; }',
          '  if (!rejected) process.exitCode = 1;',
          '}',
        ].join(' '),
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        env: gitEnv,
        killSignal: 'SIGTERM',
        timeout: 10_000,
        windowsHide: true,
      },
    );
    const afterInvalidRoot = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(activeHooksDir, name))
    ));
    check(
      'native Git hook CLI boundary rejects explicit empty and null roots without fallback',
      invalidRootResult.status === 0
        && invalidRootResult.stdout === ''
        && invalidRootResult.stderr === ''
        && JSON.stringify(afterInvalidRoot) === JSON.stringify(beforeImport),
    );

    const cliResult = spawnSync(process.execPath, [copiedInstaller], {
      cwd: repo,
      encoding: 'utf8',
      env: gitEnv,
      killSignal: 'SIGTERM',
      timeout: 15_000,
      windowsHide: true,
    });
    const expectedStdout = [
      'installed pre-commit: npm run quality:fast',
      'installed pre-push: npm run codex:ship',
      `Codex infrastructure git hooks installed in ${activeHooksDir}.`,
      '',
    ].join('\n');
    check(
      'native Git hook CLI reports success only after exact read-back',
      cliResult.status === 0
        && cliResult.signal === null
        && !cliResult.error
        && cliResult.stderr === ''
        && cliResult.stdout.replace(/\r\n/g, '\n') === expectedStdout,
    );
    const installedErrors = installedHookErrors(activeHooksDir);
    check(
      'native Git hook CLI installs exact bodies in the normal active path',
      installedErrors.length === 0,
      installedErrors.join('; '),
    );

    const beforeReinstall = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(activeHooksDir, name))
    ));
    const logs = [];
    const reinstall = installNativeHooksMain({ log: (line) => logs.push(line), root: repo });
    const afterReinstall = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(activeHooksDir, name))
    ));
    check(
      'native Git hook managed reinstall is idempotent and truthful',
      sameFixturePath(reinstall.hooksDir, activeHooksDir)
        && JSON.stringify(afterReinstall) === JSON.stringify(beforeReinstall)
        && logs.length === 3
        && logs[2] === `Codex infrastructure git hooks installed in ${activeHooksDir}.`
        && nativeHookTempArtifacts(activeHooksDir).length === 0,
    );
  });

  withNativeHookFixture('linked-default', ({ container, repo }) => {
    runFixtureGit(repo, [
      '-c', 'user.name=Codex Fixture',
      '-c', 'user.email=codex@example.invalid',
      'commit', '--allow-empty', '--quiet', '-m', 'fixture',
    ]);
    const linked = path.join(container, 'linked worktree');
    runFixtureGit(repo, ['worktree', 'add', '--detach', '--quiet', linked]);
    const activeHooksDir = path.resolve(runFixtureGit(
      linked,
      ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
    ));
    const result = installNativeHooks({ root: linked });
    const adminDir = path.resolve(runFixtureGit(linked, ['rev-parse', '--absolute-git-dir']));
    const installedErrors = installedHookErrors(activeHooksDir);
    check(
      'native Git hook installer uses the common active path for linked worktrees',
      sameFixturePath(result.hooksDir, activeHooksDir)
        && installedErrors.length === 0
        && !existsSync(path.join(adminDir, 'hooks', 'pre-commit'))
        && !existsSync(path.join(adminDir, 'hooks', 'pre-push')),
      installedErrors.join('; '),
    );
  });

  withNativeHookFixture('relative-hooks-path', ({ container, repo }) => {
    runFixtureGit(repo, ['config', 'core.hooksPath', 'relative hooks \u0442\u0435\u0441\u0442']);
    runFixtureGit(repo, [
      '-c', 'user.name=Codex Fixture',
      '-c', 'user.email=codex@example.invalid',
      'commit', '--allow-empty', '--quiet', '-m', 'fixture',
    ]);
    const linked = path.join(container, 'linked relative worktree');
    runFixtureGit(repo, ['worktree', 'add', '--detach', '--quiet', linked]);
    const mainResult = installNativeHooks({ root: repo });
    const linkedResult = installNativeHooks({ root: linked });
    const mainExpected = path.resolve(runFixtureGit(
      repo,
      ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
    ));
    const linkedExpected = path.resolve(runFixtureGit(
      linked,
      ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
    ));
    check(
      'native Git hook installer honors worktree-relative core.hooksPath',
      sameFixturePath(mainResult.hooksDir, mainExpected)
        && sameFixturePath(linkedResult.hooksDir, linkedExpected)
        && !sameFixturePath(mainExpected, linkedExpected)
        && installedHookErrors(mainExpected).length === 0
        && installedHookErrors(linkedExpected).length === 0
        && !existsSync(path.join(repo, '.git', 'hooks', 'pre-commit')),
    );
  });

  withNativeHookFixture('absolute-hooks-path', ({ container, repo }) => {
    const configured = path.join(container, 'absolute hooks \u0442\u0435\u0441\u0442');
    runFixtureGit(repo, ['config', 'core.hooksPath', configured]);
    runFixtureGit(repo, [
      '-c', 'user.name=Codex Fixture',
      '-c', 'user.email=codex@example.invalid',
      'commit', '--allow-empty', '--quiet', '-m', 'fixture',
    ]);
    const linked = path.join(container, 'linked absolute worktree');
    runFixtureGit(repo, ['worktree', 'add', '--detach', '--quiet', linked]);
    const mainResult = installNativeHooks({ root: repo });
    const linkedResult = installNativeHooks({ root: linked });
    check(
      'native Git hook installer honors one Git-selected absolute shared hooks path',
      sameFixturePath(mainResult.hooksDir, configured)
        && sameFixturePath(linkedResult.hooksDir, configured)
        && installedHookErrors(configured).length === 0
        && !existsSync(path.join(repo, '.git', 'hooks', 'pre-commit')),
    );
  });

  withNativeHookFixture('legacy-adoption', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const preCommit = path.join(hooksDir, 'pre-commit');
    const prePush = path.join(hooksDir, 'pre-push');
    writeFileSync(
      preCommit,
      expectedNativeHookBody('npm run quality:fast', { legacy: true }).replace(/\n/g, '\r\n'),
      'utf8',
    );
    writeFileSync(prePush, expectedNativeHookBody('npm run codex:ship', { legacy: true }), 'utf8');
    installNativeHooks({ root: repo });
    const installedErrors = installedHookErrors(hooksDir);
    check(
      'native Git hook installer adopts exact LF and CRLF legacy bodies',
      installedErrors.length === 0,
      installedErrors.join('; '),
    );
  });

  for (const conflictName of ['pre-commit', 'pre-push']) {
    withNativeHookFixture(`unmanaged-${conflictName}`, ({ repo }) => {
      const hooksDir = resolveActiveHooksDirectory({ root: repo });
      const conflict = path.join(hooksDir, conflictName);
      writeFileSync(conflict, '#!/bin/sh\necho unmanaged\n', 'utf8');
      const before = expectedNativeHooks.map(({ name }) => (
        hookTargetSnapshot(path.join(hooksDir, name))
      ));
      const manifestBefore = nativeHookDirectoryManifest(hooksDir);
      const logs = [];
      const failure = expectInstallerFailure(
        () => installNativeHooksMain({ log: (line) => logs.push(line), root: repo }),
        /Refusing to overwrite unmanaged Git hook/,
      );
      const after = expectedNativeHooks.map(({ name }) => (
        hookTargetSnapshot(path.join(hooksDir, name))
      ));
      check(
        `native Git hook full preflight rejects unmanaged ${conflictName} without partial state`,
        failure.threw
          && logs.length === 0
          && JSON.stringify(after) === JSON.stringify(before)
          && JSON.stringify(nativeHookDirectoryManifest(hooksDir)) === JSON.stringify(manifestBefore),
        failure.message,
      );
    });
  }

  withNativeHookFixture('forged-marker', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const forged = path.join(hooksDir, 'pre-push');
    const body = [
      '#!/bin/sh',
      '# managed-by: 3d_in_blueprints-codex-infra',
      'echo forged unmanaged body',
      '',
    ].join('\n');
    writeFileSync(forged, body, 'utf8');
    const failure = expectInstallerFailure(
      () => installNativeHooks({ root: repo }),
      /Refusing to overwrite unmanaged Git hook/,
    );
    check(
      'native Git hook ownership rejects a forged marker without takeover',
      failure.threw
        && readFileSync(forged, 'utf8') === body
        && !existsSync(path.join(hooksDir, 'pre-commit')),
      failure.message,
    );
  });

  withNativeHookFixture('cli-failure-output', ({ gitEnv, repo }) => {
    const scriptsDir = path.join(repo, 'scripts');
    const copiedInstaller = path.join(scriptsDir, 'install-hooks.mjs');
    mkdirSync(scriptsDir);
    mkdirSync(path.join(scriptsDir, 'lib'));
    copyFileSync(path.join(root, 'scripts', 'install-hooks.mjs'), copiedInstaller);
    copyFileSync(
      path.join(root, 'scripts', 'lib', 'native-hook-installer.mjs'),
      path.join(scriptsDir, 'lib', 'native-hook-installer.mjs'),
    );
    const hooksDir = path.resolve(runFixtureGit(
      repo,
      ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
    ));
    const conflict = path.join(hooksDir, 'pre-push');
    writeFileSync(conflict, '#!/bin/sh\necho unmanaged\n', 'utf8');
    const result = spawnSync(process.execPath, [copiedInstaller], {
      cwd: repo,
      encoding: 'utf8',
      env: gitEnv,
      killSignal: 'SIGTERM',
      timeout: 15_000,
      windowsHide: true,
    });
    check(
      'native Git hook CLI failure is nonzero with controlled stderr and no success stdout',
      result.status === 1
        && result.stdout === ''
        && /Cannot install Git hooks:/.test(result.stderr)
        && /unmanaged Git hook/.test(result.stderr)
        && !/installed pre-|git hooks installed in/.test(result.stderr)
        && !existsSync(path.join(hooksDir, 'pre-commit')),
    );
  });

  withNativeHookFixture('nested-parent-root', ({ repo }) => {
    const nested = path.join(repo, 'nested checkout without git metadata');
    mkdirSync(nested);
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const before = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(hooksDir, name))
    ));
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ log: (line) => logs.push(line), root: nested }),
      /intended repository root/,
    );
    const after = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(hooksDir, name))
    ));
    check(
      'native Git hook installer rejects a nested directory that would target a parent repository',
      failure.threw && logs.length === 0 && JSON.stringify(after) === JSON.stringify(before),
      failure.message,
    );
  });

  let nonRepoContainer = null;
  try {
    nonRepoContainer = mkdtempSync(path.join(tmpdir(), 'blueprints-native-hooks-'));
    const nonRepoContext = createIsolatedFixtureGitContext(nonRepoContainer);
    nativeHookFixtureContexts.set(nonRepoContext.container, nonRepoContext);
    const nonRepo = path.join(nonRepoContainer, 'not a repository');
    mkdirSync(nonRepo);
    const manifestBefore = readdirSync(nonRepo);
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ log: (line) => logs.push(line), root: nonRepo }),
      /Git repository root lookup exited with status/,
    );
    check(
      'native Git hook installer rejects a non-repository before filesystem mutation',
      failure.threw
        && logs.length === 0
        && JSON.stringify(readdirSync(nonRepo)) === JSON.stringify(manifestBefore),
      failure.message,
    );
  } catch (error) {
    check('native Git hook non-repository fixture completes', false, errorDetailForCheck(error));
  } finally {
    if (nonRepoContainer) {
      try {
        cleanupNativeHookFixture(nonRepoContainer);
      } catch (error) {
        check('native Git hook non-repository fixture cleanup', false, errorDetailForCheck(error));
      }
    }
  }

  withNativeHookFixture('non-regular-target', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const target = path.join(hooksDir, 'pre-push');
    mkdirSync(target);
    const failure = expectInstallerFailure(
      () => installNativeHooks({ root: repo }),
      /not a regular file/,
    );
    check(
      'native Git hook preflight rejects a directory target before first-hook mutation',
      failure.threw
        && lstatSync(target).isDirectory()
        && !existsSync(path.join(hooksDir, 'pre-commit')),
      failure.message,
    );
  });

  withNativeHookFixture('hard-linked-target', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const target = path.join(hooksDir, 'pre-push');
    const linked = path.join(hooksDir, 'pre-push-linked-copy');
    writeFileSync(target, expectedNativeHookBody('npm run codex:ship'), 'utf8');
    linkSync(target, linked);
    const failure = expectInstallerFailure(
      () => installNativeHooks({ root: repo }),
      /multiply-linked Git hook/,
    );
    check(
      'native Git hook preflight rejects hard-linked targets without changing link topology',
      failure.threw
        && lstatSync(target).nlink === 2
        && lstatSync(linked).nlink === 2
        && !existsSync(path.join(hooksDir, 'pre-commit')),
      failure.message,
    );
  });

  withNativeHookFixture('active-path-file', ({ container, repo }) => {
    const configuredFile = path.join(container, 'hooks path is a file');
    writeFileSync(configuredFile, 'sentinel', 'utf8');
    runFixtureGit(repo, ['config', 'core.hooksPath', configuredFile]);
    const failure = expectInstallerFailure(
      () => installNativeHooks({ root: repo }),
      /not a directory/,
    );
    check(
      'native Git hook installer rejects a Git-selected non-directory active path',
      failure.threw && readFileSync(configuredFile, 'utf8') === 'sentinel',
      failure.message,
    );
  });

  withNativeHookFixture('injected-reparse', ({ container, repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const redirected = path.join(container, 'redirected hooks');
    mkdirSync(redirected);
    const redirectedFs = nativeInstallerFs({
      realpathSync(candidate) {
        if (sameFixturePath(candidate, hooksDir)) return redirected;
        return realpathSync(candidate);
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: redirectedFs, log: (line) => logs.push(line), root: repo }),
      /reparse redirect/,
    );
    check(
      'native Git hook preflight rejects a privilege-independent reparse redirect',
      failure.threw
        && logs.length === 0
        && !existsSync(path.join(hooksDir, 'pre-commit'))
        && !existsSync(path.join(redirected, 'pre-commit')),
      failure.message,
    );
  });

  withNativeHookFixture('target-symlink-classifier', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const target = path.join(hooksDir, 'pre-push');
    writeFileSync(target, expectedNativeHookBody('npm run codex:ship'), 'utf8');
    const symlinkFs = nativeInstallerFs({
      lstatSync(candidate) {
        const stat = lstatSync(candidate);
        if (!sameFixturePath(candidate, target)) return stat;
        return {
          isDirectory: () => false,
          isFile: () => false,
          isSymbolicLink: () => true,
          mode: stat.mode,
          nlink: stat.nlink,
        };
      },
    });
    const failure = expectInstallerFailure(
      () => installNativeHooks({ fsApi: symlinkFs, root: repo }),
      /symbolic-link, junction, or reparse Git hook/,
    );
    check(
      'native Git hook target classifier rejects symlink or junction targets on every platform',
      failure.threw
        && !existsSync(path.join(hooksDir, 'pre-commit'))
        && readFileSync(target, 'utf8') === expectedNativeHookBody('npm run codex:ship'),
      failure.message,
    );
  });

  withNativeHookFixture('actual-hooks-junction', ({ container, repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const relative = path.relative(repo, hooksDir);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`unexpected default hooks path outside fixture repo: ${hooksDir}`);
    }
    const redirected = path.join(container, 'junction destination');
    rmSync(hooksDir, { force: true, recursive: true });
    mkdirSync(redirected);
    let junctionCreated = false;
    try {
      symlinkSync(redirected, hooksDir, process.platform === 'win32' ? 'junction' : 'dir');
      junctionCreated = true;
    } catch (error) {
      if (!['EACCES', 'EPERM', 'ENOTSUP'].includes(error?.code)) throw error;
    }
    if (junctionCreated) {
      const junctionStat = lstatSync(hooksDir);
      const junctionRealPath = realpathSync(hooksDir);
      const failure = expectInstallerFailure(
        () => installNativeHooks({ root: repo }),
        /symbolic link or junction|reparse redirect/,
      );
      const redirectedPreCommit = existsSync(path.join(redirected, 'pre-commit'));
      const redirectedPrePush = existsSync(path.join(redirected, 'pre-push'));
      check(
        'native Git hook preflight rejects an actual hooks-directory junction or symlink',
        failure.threw
          && !redirectedPreCommit
          && !redirectedPrePush,
        [
          failure.message || 'installer returned success',
          `isSymbolicLink=${junctionStat.isSymbolicLink()}`,
          `realpath=${junctionRealPath}`,
          `redirectedTargets=${redirectedPreCommit}/${redirectedPrePush}`,
        ].join('; '),
      );
    } else {
      check(
        'native Git hook actual junction capability is explicitly deferred when unavailable',
        true,
        'platform denied junction or directory-symlink creation; injected reparse case remains mandatory',
      );
    }
  });

  withNativeHookFixture('mkdir-rollback', ({ repo }) => {
    const configured = path.join(repo, 'created parent', 'created hooks');
    runFixtureGit(repo, ['config', 'core.hooksPath', configured]);
    let mkdirCalls = 0;
    const failingFs = nativeInstallerFs({
      mkdirSync(candidate) {
        mkdirCalls += 1;
        if (mkdirCalls === 2) throw Object.assign(new Error('injected mkdir failure'), { code: 'EACCES' });
        return mkdirSync(candidate);
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: failingFs, log: (line) => logs.push(line), root: repo }),
      /injected mkdir failure/,
    );
    check(
      'native Git hook handled mkdir failure removes installer-created directories',
      failure.threw
        && logs.length === 0
        && !existsSync(path.join(repo, 'created parent')),
      failure.message,
    );
  });

  withNativeHookFixture('stage-write-rollback', ({ repo }) => {
    const configured = path.join(repo, 'staged parent', 'active hooks');
    runFixtureGit(repo, ['config', 'core.hooksPath', configured]);
    let failed = false;
    const failingFs = nativeInstallerFs({
      writeFileSync(candidate, ...args) {
        if (!failed && path.basename(candidate).includes('.pre-push.codex-stage-')) {
          failed = true;
          throw Object.assign(new Error('injected stage write failure'), { code: 'ENOSPC' });
        }
        return writeFileSync(candidate, ...args);
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: failingFs, log: (line) => logs.push(line), root: repo }),
      /injected stage write failure/,
    );
    check(
      'native Git hook handled stage-write failure leaves no targets directories or success output',
      failure.threw
        && logs.length === 0
        && !existsSync(path.join(repo, 'staged parent')),
      failure.message,
    );
  });

  withNativeHookFixture('chmod-rollback', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    for (const { name, command } of expectedNativeHooks) {
      const target = path.join(hooksDir, name);
      writeFileSync(target, expectedNativeHookBody(command), 'utf8');
      chmodSync(target, name === 'pre-commit' ? 0o744 : 0o700);
    }
    const before = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(hooksDir, name))
    ));
    let failed = false;
    const failingFs = nativeInstallerFs({
      chmodSync(candidate, mode) {
        if (!failed && sameFixturePath(candidate, path.join(hooksDir, 'pre-push'))) {
          failed = true;
          throw Object.assign(new Error('injected target chmod failure'), { code: 'EPERM' });
        }
        return chmodSync(candidate, mode);
      },
    });
    const failure = expectInstallerFailure(
      () => installNativeHooks({ fsApi: failingFs, root: repo }),
      /injected target chmod failure/,
    );
    const after = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(hooksDir, name))
    ));
    check(
      'native Git hook handled chmod failure restores exact prior bytes and modes',
      failure.threw
        && JSON.stringify(after) === JSON.stringify(before)
        && nativeHookTempArtifacts(hooksDir).length === 0,
      failure.message,
    );
  });

  withNativeHookFixture('second-rename-rollback', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    for (const { name, command } of expectedNativeHooks) {
      const lineEnding = name === 'pre-commit' ? '\r\n' : '\n';
      writeFileSync(
        path.join(hooksDir, name),
        expectedNativeHookBody(command, { legacy: true }).replace(/\n/g, lineEnding),
        'utf8',
      );
      chmodSync(path.join(hooksDir, name), name === 'pre-commit' ? 0o744 : 0o700);
    }
    const before = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(hooksDir, name))
    ));
    let failed = false;
    const failingFs = nativeInstallerFs({
      renameSync(source, destination) {
        if (
          !failed
          && sameFixturePath(destination, path.join(hooksDir, 'pre-push'))
          && path.basename(source).includes('.pre-push.codex-stage-')
        ) {
          failed = true;
          throw Object.assign(new Error('injected second rename failure'), { code: 'EPERM' });
        }
        return renameSync(source, destination);
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: failingFs, log: (line) => logs.push(line), root: repo }),
      /injected second rename failure/,
    );
    const after = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(hooksDir, name))
    ));
    check(
      'native Git hook second-target rename failure rolls back exact legacy bytes and modes',
      failure.threw
        && logs.length === 0
        && JSON.stringify(after) === JSON.stringify(before)
        && nativeHookTempArtifacts(hooksDir).length === 0,
      failure.message,
    );
  });

  withNativeHookFixture('readback-rollback', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const preCommit = path.join(hooksDir, 'pre-commit');
    let mismatched = false;
    const failingFs = nativeInstallerFs({
      readFileSync(candidate, ...args) {
        const value = readFileSync(candidate, ...args);
        if (!mismatched && sameFixturePath(candidate, preCommit) && args[0] === 'utf8') {
          mismatched = true;
          return `${value}read-back mismatch`;
        }
        return value;
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: failingFs, log: (line) => logs.push(line), root: repo }),
      /read-back differs/,
    );
    check(
      'native Git hook final read-back mismatch rolls back both new targets',
      failure.threw
        && logs.length === 0
        && !existsSync(preCommit)
        && !existsSync(path.join(hooksDir, 'pre-push'))
        && nativeHookTempArtifacts(hooksDir).length === 0,
      failure.message,
    );
  });

  withNativeHookFixture('verified-recovery-candidate', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const preCommit = path.join(hooksDir, 'pre-commit');
    const prePush = path.join(hooksDir, 'pre-push');
    seedLegacyNativeHooks(hooksDir);
    const originalPreCommit = hookTargetSnapshot(preCommit);
    const originalPrePush = hookTargetSnapshot(prePush);
    let forcedReadbackFailure = false;
    let forcedRollbackRenameFailure = false;
    const failingFs = nativeInstallerFs({
      readFileSync(candidate, ...args) {
        const value = readFileSync(candidate, ...args);
        if (
          !forcedReadbackFailure
          && sameFixturePath(candidate, preCommit)
          && args[0] === 'utf8'
        ) {
          forcedReadbackFailure = true;
          return `${value}force rollback`;
        }
        return value;
      },
      renameSync(source, destination) {
        if (
          !forcedRollbackRenameFailure
          && sameFixturePath(destination, prePush)
          && path.basename(source).includes('.pre-push.codex-rollback-')
        ) {
          forcedRollbackRenameFailure = true;
          throw Object.assign(new Error('injected rollback rename failure'), { code: 'EPERM' });
        }
        return renameSync(source, destination);
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: failingFs, log: (line) => logs.push(line), root: repo }),
      /Rollback also failed/,
    );
    const recoveryMatch = /recovery candidate preserved at ([^;]+)$/.exec(failure.message);
    const recoveryPath = recoveryMatch?.[1] || '';
    const recoverySnapshot = recoveryPath ? hookTargetSnapshot(recoveryPath) : { exists: false };
    check(
      'native Git hook rollback failure preserves and truthfully reports one verified recovery candidate',
      failure.threw
        && forcedReadbackFailure
        && forcedRollbackRenameFailure
        && logs.length === 0
        && recoveryPath !== ''
        && sameFixturePath(path.dirname(recoveryPath), hooksDir)
        && path.basename(recoveryPath).includes('.pre-push.codex-rollback-')
        && JSON.stringify(recoverySnapshot) === JSON.stringify(originalPrePush)
        && JSON.stringify(hookTargetSnapshot(preCommit)) === JSON.stringify(originalPreCommit)
        && readFileSync(prePush, 'utf8') === expectedNativeHookBody('npm run codex:ship')
        && nativeHookTempArtifacts(hooksDir).length === 1
        && sameFixturePath(path.join(hooksDir, nativeHookTempArtifacts(hooksDir)[0]), recoveryPath),
      failure.message,
    );
  });

  withNativeHookFixture('rollback-write-failure', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const preCommit = path.join(hooksDir, 'pre-commit');
    const prePush = path.join(hooksDir, 'pre-push');
    seedLegacyNativeHooks(hooksDir);
    const originalPreCommit = hookTargetSnapshot(preCommit);
    let forcedReadbackFailure = false;
    let forcedRollbackWriteFailure = false;
    const failingFs = nativeInstallerFs({
      readFileSync(candidate, ...args) {
        const value = readFileSync(candidate, ...args);
        if (
          !forcedReadbackFailure
          && sameFixturePath(candidate, preCommit)
          && args[0] === 'utf8'
        ) {
          forcedReadbackFailure = true;
          return `${value}force rollback`;
        }
        return value;
      },
      writeFileSync(candidate, ...args) {
        if (
          !forcedRollbackWriteFailure
          && path.basename(candidate).includes('.pre-push.codex-rollback-')
        ) {
          forcedRollbackWriteFailure = true;
          throw Object.assign(new Error('injected rollback write failure'), { code: 'ENOSPC' });
        }
        return writeFileSync(candidate, ...args);
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: failingFs, log: (line) => logs.push(line), root: repo }),
      /Rollback also failed/,
    );
    check(
      'native Git hook rollback write failure reports no unverified recovery candidate',
      failure.threw
        && forcedReadbackFailure
        && forcedRollbackWriteFailure
        && logs.length === 0
        && !/recovery candidate preserved at/.test(failure.message)
        && JSON.stringify(hookTargetSnapshot(preCommit)) === JSON.stringify(originalPreCommit)
        && readFileSync(prePush, 'utf8') === expectedNativeHookBody('npm run codex:ship')
        && nativeHookTempArtifacts(hooksDir).length === 0,
      failure.message,
    );
  });

  withNativeHookFixture('corrupt-recovery-candidate', ({ repo }) => {
    const hooksDir = resolveActiveHooksDirectory({ root: repo });
    const preCommit = path.join(hooksDir, 'pre-commit');
    const prePush = path.join(hooksDir, 'pre-push');
    seedLegacyNativeHooks(hooksDir);
    const originalPreCommit = hookTargetSnapshot(preCommit);
    let forcedReadbackFailure = false;
    let corruptedRecovery = false;
    const failingFs = nativeInstallerFs({
      readFileSync(candidate, ...args) {
        const value = readFileSync(candidate, ...args);
        if (
          !forcedReadbackFailure
          && sameFixturePath(candidate, preCommit)
          && args[0] === 'utf8'
        ) {
          forcedReadbackFailure = true;
          return `${value}force rollback`;
        }
        return value;
      },
      writeFileSync(candidate, value, ...args) {
        if (
          !corruptedRecovery
          && path.basename(candidate).includes('.pre-push.codex-rollback-')
        ) {
          corruptedRecovery = true;
          return writeFileSync(candidate, Buffer.from('corrupt recovery'), ...args);
        }
        return writeFileSync(candidate, value, ...args);
      },
    });
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({ fsApi: failingFs, log: (line) => logs.push(line), root: repo }),
      /Rollback also failed/,
    );
    check(
      'native Git hook rollback rejects and removes a corrupt unverified recovery candidate',
      failure.threw
        && forcedReadbackFailure
        && corruptedRecovery
        && logs.length === 0
        && /recovery candidate bytes differ/.test(failure.message)
        && !/recovery candidate preserved at/.test(failure.message)
        && JSON.stringify(hookTargetSnapshot(preCommit)) === JSON.stringify(originalPreCommit)
        && readFileSync(prePush, 'utf8') === expectedNativeHookBody('npm run codex:ship')
        && nativeHookTempArtifacts(hooksDir).length === 0,
      failure.message,
    );
  });

  withNativeHookFixture('path-change-rollback', ({ container, repo }) => {
    const firstHooksDir = path.join(repo, '.git', 'hooks');
    const changedHooksDir = path.join(container, 'changed active hooks');
    const calls = [];
    let absoluteHookLookups = 0;
    const changingSpawn = (command, args, options) => {
      calls.push({ args, command, options });
      if (args.includes('--show-toplevel')) {
        return { error: null, signal: null, status: 0, stderr: '', stdout: `${repo}\n` };
      }
      if (args.includes('--path-format=absolute')) absoluteHookLookups += 1;
      const output = absoluteHookLookups <= 1 ? firstHooksDir : changedHooksDir;
      return { error: null, signal: null, status: 0, stderr: '', stdout: `${output}\n` };
    };
    const failure = expectInstallerFailure(
      () => installNativeHooks({ root: repo, spawn: changingSpawn }),
      /hooks path changed after preflight/,
    );
    check(
      'native Git hook installer rolls back staging when the active path changes after preflight',
      failure.threw
        && calls.length === 6
        && !existsSync(path.join(firstHooksDir, 'pre-commit'))
        && !existsSync(path.join(firstHooksDir, 'pre-push'))
        && !existsSync(changedHooksDir)
        && nativeHookTempArtifacts(firstHooksDir).length === 0,
      failure.message,
    );
  });

  withNativeHookFixture('final-path-change-rollback', ({ container, repo }) => {
    const firstHooksDir = path.join(repo, '.git', 'hooks');
    const changedHooksDir = path.join(container, 'final changed active hooks');
    const calls = [];
    let absoluteHookLookups = 0;
    const changingSpawn = (command, args, options) => {
      calls.push({ args, command, options });
      if (args.includes('--show-toplevel')) {
        return { error: null, signal: null, status: 0, stderr: '', stdout: `${repo}\n` };
      }
      if (args.includes('--path-format=absolute')) absoluteHookLookups += 1;
      const output = absoluteHookLookups <= 2 ? firstHooksDir : changedHooksDir;
      return { error: null, signal: null, status: 0, stderr: '', stdout: `${output}\n` };
    };
    const logs = [];
    const failure = expectInstallerFailure(
      () => installNativeHooksMain({
        log: (line) => logs.push(line),
        root: repo,
        spawn: changingSpawn,
      }),
      /hooks path changed after installation read-back/,
    );
    check(
      'native Git hook installer rolls back applied targets when the path changes before success',
      failure.threw
        && calls.length === 9
        && logs.length === 0
        && !existsSync(path.join(firstHooksDir, 'pre-commit'))
        && !existsSync(path.join(firstHooksDir, 'pre-push'))
        && !existsSync(changedHooksDir)
        && nativeHookTempArtifacts(firstHooksDir).length === 0,
      failure.message,
    );
  });

  if (liveHooksDir && liveHookSentinel) {
    const liveHookSentinelAfter = expectedNativeHooks.map(({ name }) => (
      hookTargetSnapshot(path.join(liveHooksDir, name))
    ));
    check(
      'native Git hook executable fixtures leave live active hooks byte-and-mode identical',
      JSON.stringify(liveHookSentinelAfter) === JSON.stringify(liveHookSentinel),
    );
  }
}

if (exists('lefthook.yml')) {
  const lefthook = read('lefthook.yml').replace(/\r\n/g, '\n');
  check('Lefthook matches the exact approved pre-commit and pre-push topology', lefthook === expectedLefthook);
  check(
    'Lefthook negative fixture rejects pre-commit drift',
    lefthook.replace('npm run quality:fast', 'npm run verify') !== expectedLefthook,
  );
  check(
    'Lefthook negative fixture rejects pre-push drift',
    lefthook.replace('npm run codex:ship', 'npm run quality:deep') !== expectedLefthook,
  );
}

if (exists('.codex/hooks/post-tool-verify.js')) {
  const hookBody = read('.codex/hooks/post-tool-verify.js');
  const route = (toolInput, platform = process.platform) => planPostToolVerification(
    JSON.stringify({ tool_input: toolInput }),
    { platform, root },
  ).commands;
  check('post-tool routes README to quality:deep', JSON.stringify(route({ file_path: 'README.md' })) === JSON.stringify(['quality:deep']));
  check('post-tool routes .gitignore to quality:deep', JSON.stringify(route({ path: '.gitignore' })) === JSON.stringify(['quality:deep']));
  check('post-tool routes handoff docs to quality:deep', JSON.stringify(route({ files: ['docs/handoff/ITERATION_LOG.md'] })) === JSON.stringify(['quality:deep']));
  check('post-tool parses structured MultiEdit entries', JSON.stringify(route({ edits: [{ file_path: 'docs/agent/verification.md' }] })) === JSON.stringify(['quality:deep']));
  check(
    'post-tool preserves content-only MultiEdit records with a top-level path',
    JSON.stringify(route({ file_path: 'README.md', edits: [{ old_string: 'before', new_string: 'after' }] })) === JSON.stringify(['quality:deep']),
  );
  check('post-tool accepts Windows path separators', JSON.stringify(route({ file_path: 'docs\\agent\\verification.md' })) === JSON.stringify(['quality:deep']));
  check('post-tool classifies Windows paths case-insensitively', JSON.stringify(route({ file_path: 'README.MD' }, 'win32')) === JSON.stringify(['quality:deep']));
  check('post-tool canonicalizes Windows trailing-dot aliases', JSON.stringify(route({ file_path: 'README.md.' }, 'win32')) === JSON.stringify(['quality:deep']));
  check('post-tool canonicalizes Windows trailing-space directory aliases', JSON.stringify(route({ file_path: 'backend. \\src\\blueprints_backend\\job.py' }, 'win32')) === JSON.stringify(['quality:deep', 'test:blender:if-available']));
  check('post-tool routes backend source to conditional Blender', JSON.stringify(route({ file_path: 'backend/src/blueprints_backend/cli.py' })) === JSON.stringify(['quality:deep', 'test:blender:if-available']));
  check('post-tool routes Blender add-on source to conditional Blender', JSON.stringify(route({ file_path: 'blender_addon/blueprints_addon/bridge.py' })) === JSON.stringify(['quality:deep', 'test:blender:if-available']));
  check('post-tool routes package_release.py to conditional Blender', JSON.stringify(route({ file_path: 'scripts/package_release.py' })) === JSON.stringify(['quality:deep', 'test:blender:if-available']));
  check('post-tool routes the shared Python resolver to conditional Blender', JSON.stringify(route({ file_path: 'scripts/lib/python-resolver.mjs' })) === JSON.stringify(['quality:deep', 'test:blender:if-available']));
  check('post-tool keeps backend tests on quality:deep only', JSON.stringify(route({ file_path: 'backend/tests/test_cli.py' })) === JSON.stringify(['quality:deep']));
  check('post-tool ignores irrelevant paths', route({ file_path: 'notes/local.txt' }).length === 0);
  check(
    'post-tool ignores governed-looking arbitrary content',
    route({ file_path: 'notes/local.txt', content: 'backend/src/blueprints_backend/cli.py' }).length === 0,
  );
  const mixedPatch = [
    '*** Begin Patch',
    '*** Update File: README.md',
    '*** Update File: blender_addon/blueprints_addon/bridge.py',
    '*** End Patch',
  ].join('\n');
  check(
    'post-tool mixed apply_patch uses the strongest route',
    JSON.stringify(route({ input: mixedPatch })) === JSON.stringify(['quality:deep', 'test:blender:if-available']),
  );
  const confinedAbsolute = path.join(root, 'docs', 'agent', 'verification.md');
  check('post-tool accepts confined absolute paths', JSON.stringify(route({ file_path: confinedAbsolute })) === JSON.stringify(['quality:deep']));
  for (const [name, rawInput, fixturePlatform] of [
    ['empty payload', ''],
    ['malformed payload', '{'],
    ['non-object payload', '[]'],
    ['unknown payload', JSON.stringify({ tool_input: { content: 'nothing changed' } })],
    ['empty path', JSON.stringify({ tool_input: { file_path: '' } })],
    ['mixed valid and malformed file list', JSON.stringify({ tool_input: { file_path: 'README.md', files: [null] } })],
    ['mixed valid and unknown file object', JSON.stringify({ tool_input: { files: [{ path: 'README.md' }, { unexpected: 'backend/src/blueprints_backend/job.py' }] } })],
    ['mixed path and unknown edit object', JSON.stringify({ tool_input: { file_path: 'README.md', edits: [{ unexpected: 'backend/src/blueprints_backend/job.py' }] } })],
    ['escaped path', JSON.stringify({ tool_input: { file_path: path.resolve(root, '..', 'escape.md') } })],
    ['Windows traversal', JSON.stringify({ tool_input: { file_path: '..\\escape.md' } })],
    ['drive-relative path', JSON.stringify({ tool_input: { file_path: 'C:escape.md' } })],
    ['drive-absolute escape', JSON.stringify({ tool_input: { file_path: 'C:\\outside\\escape.md' } })],
    ['UNC escape', JSON.stringify({ tool_input: { file_path: '\\\\server\\share\\escape.md' } })],
    ['NTFS default-stream alias', JSON.stringify({ tool_input: { file_path: 'README.md::$DATA' } }), 'win32'],
    ['NTFS Blender-source stream alias', JSON.stringify({ tool_input: { file_path: 'backend/src/blueprints_backend/job.py:stream' } }), 'win32'],
    ['Windows short-name alias', JSON.stringify({ tool_input: { file_path: 'README~1.MD' } }), 'win32'],
    ['Windows device component', JSON.stringify({ tool_input: { file_path: 'docs/agent/NUL.txt' } }), 'win32'],
  ]) {
    let rejected = false;
    try {
      planPostToolVerification(rawInput, { platform: fixturePlatform || process.platform, root });
    } catch {
      rejected = true;
    }
    check(`post-tool rejects ${name}`, rejected);
  }
  const executed = [];
  const shortCircuit = executeVerificationPlan(['quality:deep', 'test:blender:if-available'], (command) => {
    executed.push(command);
    return { detail: 'expected failure', ok: false };
  });
  check('post-tool short-circuits Blender after quality:deep failure', !shortCircuit.ok && executed.length === 1 && executed[0] === 'quality:deep');
  const propagated = executeVerificationPlan(['quality:deep'], () => { throw new Error('runner failed'); });
  check('post-tool propagates runner failures as controlled failures', !propagated.ok && /runner failed/.test(propagated.result.detail));
  check('post-tool has no production dry-run bypass', !/CODEX_INFRA_POST_TOOL_DRY_RUN/.test(hookBody));
  check('post-tool uses cmd.exe and npm.cmd on Windows', /cmd\.exe/.test(hookBody) && /npm\.cmd/.test(hookBody) && /\/d/.test(hookBody) && /\/s/.test(hookBody));
  check('post-tool uses direct npm argv on POSIX', /spawnSync\('npm', args/.test(hookBody));
  check('post-tool invokes optional Blender only after quality:deep', /test:blender/.test(hookBody) && /--if-available/.test(hookBody));
}

for (const script of [
  'scripts/verify-codex-plugin.mjs',
  'scripts/check-governance.mjs',
  'scripts/check-js-syntax.mjs',
  'scripts/verify-codex-infra.mjs',
  'scripts/run-python-tests.mjs',
  'scripts/run-blender-smoke.mjs',
  'scripts/run-packaging-smoke.mjs',
  'scripts/install-hooks.mjs',
]) {
  if (exists(script)) {
    check(`${script} resolves repo root from script path`, /fileURLToPath\(import\.meta\.url\)/.test(read(script)));
  }
}

if (exists('docs/agent/profiles/blender-addon.md')) {
  const profile = read('docs/agent/profiles/blender-addon.md');
  check('active profile has a current implemented-contract surface', /## Current Implemented Contract/.test(profile));
  check('active profile labels I1 through I8 as historical contracts', /## Historical Iteration Contracts/.test(profile));
  check('active profile keeps projection and rendered preview deferred', /projection remains deferred/i.test(profile) && /raw SVG source, not a rendered preview/i.test(profile));
  check('active profile distinguishes two-ZIP packaging from dormant Windows EXE tooling', /two separate ZIPs/i.test(profile) && /Windows EXE, installer, and signing toolchain remains dormant/i.test(profile));
}

if (exists('README.md')) {
  const readme = read('README.md');
  check('README lists Blender smoke command', /npm run test:blender/.test(readme));
  check('README lists packaging smoke command', /npm run test:packaging/.test(readme));
  check(
    'README has runnable PowerShell backend source command',
    /```powershell[\s\S]*?\$env:PYTHONPATH\s*=\s*["']backend\/src["'][\s\S]*?python -m blueprints_backend <job-folder>[\s\S]*?```/.test(readme),
  );
  check(
    'README has runnable POSIX backend source command',
    /```(?:bash|sh)[\s\S]*?PYTHONPATH=backend\/src python -m blueprints_backend <job-folder>[\s\S]*?```/.test(readme),
  );
  check(
    'README documents two-ZIP installation and Backend Source folder contract',
    /blueprints_addon-<addon-version>\.zip/.test(readme)
      && /blueprints_backend-<backend-version>\.zip/.test(readme)
      && /Backend Source[\s\S]{0,240}folder that\s+directly contains\s+`?blueprints_backend`?/i.test(readme)
      && /not to the ZIP and not to the\s+`blueprints_backend` package folder itself/i.test(readme),
  );
  check(
    'README documents optional Backend Python and Job Root defaults',
    /Backend Python[\s\S]*optional[\s\S]*sys\.executable/i.test(readme)
      && /Job Root[\s\S]*optional[\s\S]*temporary job folders/i.test(readme),
  );
}

if (exists('docs/release/packaging.md')) {
  const packagingDoc = read('docs/release/packaging.md');
  check(
    'release docs describe independent component version owners',
    /0\.2\.1/.test(packagingDoc)
      && /0\.1\.1/.test(packagingDoc)
      && /0\.1\.0/.test(packagingDoc)
      && /not (?:a )?lockstep|independent/i.test(packagingDoc),
  );
  check(
    'release docs describe two ZIPs and exact Backend Source parent folder',
    /blueprints_addon-<addon-version>\.zip/.test(packagingDoc)
      && /blueprints_backend-<backend-version>\.zip/.test(packagingDoc)
      && /Backend Source folder directly contains the\s+`blueprints_backend` package/i.test(packagingDoc)
      && /not the ZIP and\s+not the package directory itself/i.test(packagingDoc),
  );
}

if (exists('docs/agent/skill-map.md')) {
  const skillMap = read('docs/agent/skill-map.md');
  check('skill map keeps packaging smoke as command, not skill', /Packaging smoke is a quality command \(`npm run test:packaging`\)/.test(skillMap));
  check('skill map quality line does not list packaging smoke as skill', !/Quality:[^\n]*packaging smoke/.test(skillMap));
}

if (exists('blender_addon/blueprints_addon/bridge.py')) {
  const bridge = read('blender_addon/blueprints_addon/bridge.py');
  check(
    'Blender bridge launches backend from trusted backend source instead of job cwd',
    /cwd=str\(backend_src_path\)/.test(bridge) && !/cwd=str\(job_dir\)/.test(bridge),
  );
}

if (exists('blender_addon/blueprints_addon/__init__.py')) {
  const addonEntrypoint = read('blender_addon/blueprints_addon/__init__.py');
  check('Blender add-on version owner records 0.2.1', /"version":\s*\(0,\s*2,\s*1\)/.test(addonEntrypoint));
}

if (exists('backend/src/blueprints_backend/__init__.py')) {
  const backendEntrypoint = read('backend/src/blueprints_backend/__init__.py');
  check('backend version owner records 0.1.1', /__version__\s*=\s*["']0\.1\.1["']/.test(backendEntrypoint));
}

if (exists('backend/src/blueprints_backend/image_assist.py')) {
  const imageAssist = read('backend/src/blueprints_backend/image_assist.py');
  check(
    'Image Assist owns its supported-type constants',
    /SUPPORTED_OVERLAY_TYPES\s*=\s*\{/.test(imageAssist)
      && /SUPPORTED_PRIMITIVES\s*=\s*\{/.test(imageAssist),
  );
}

if (
  exists('backend/src/blueprints_backend/svg_ids.py')
  && exists('backend/src/blueprints_backend/svg_writer.py')
  && exists('backend/src/blueprints_backend/image_assist.py')
) {
  const svgIds = read('backend/src/blueprints_backend/svg_ids.py');
  const svgWriter = read('backend/src/blueprints_backend/svg_writer.py');
  const imageAssist = read('backend/src/blueprints_backend/image_assist.py');
  check(
    'normal and Image Assist SVG share the svg_ids.dom_id owner',
    /def dom_id\(kind, \*logical_ids\):/.test(svgIds)
      && /from \.svg_ids import dom_id/.test(svgWriter)
      && /from \.svg_ids import dom_id/.test(imageAssist)
      && !/def dom_id\(/.test(svgWriter)
      && !/def dom_id\(/.test(imageAssist),
  );
}

if (exists('backend/src/blueprints_backend/job.py')) {
  const job = read('backend/src/blueprints_backend/job.py');
  check(
    'job validation reuses Image Assist supported-type owners',
    /from \. import [^\n]*\bimage_assist\b/.test(job)
      && /not in image_assist\.SUPPORTED_OVERLAY_TYPES/.test(job)
      && /not in image_assist\.SUPPORTED_PRIMITIVES/.test(job),
  );
}

let failed = 0;
for (const item of checks) {
  const suffix = item.detail ? ` - ${item.detail}` : '';
  if (item.condition) {
    console.log(`[PASS] ${item.name}${suffix}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${item.name}${suffix}`);
  }
}

console.log(`SUMMARY: ${checks.length - failed}/${checks.length} PASS, ${failed} FAIL`);
process.exitCode = failed === 0 ? 0 : 1;
