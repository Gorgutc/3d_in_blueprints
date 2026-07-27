import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkJavaScriptFiles,
  collectJavaScriptFiles,
} from './lib/js-syntax-checker.mjs';
import {
  executeVerificationPlan,
  planPostToolVerification,
} from './lib/post-tool-routing.mjs';
import {
  main as runBlenderSmokeMain,
  parseSmokeArguments,
  resolveBlender,
} from './run-blender-smoke.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const checks = [];
const frozenLiveAssertionIds = new Set();

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
  'scripts/lib/post-tool-routing.mjs',
  'scripts/verify-codex-infra.mjs',
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

function nativeHookErrors(source) {
  const block = /const hooks = new Map\(\[([\s\S]*?)\]\);/.exec(source)?.[1] || '';
  const entries = [...block.matchAll(/\['([^']+)',\s*'([^']+)'\]/g)]
    .map((match) => [match[1], match[2]]);
  const expected = [
    ['pre-commit', 'npm run quality:fast'],
    ['pre-push', 'npm run codex:ship'],
  ];
  return JSON.stringify(entries) === JSON.stringify(expected)
    ? []
    : [`native Git hook map differs: ${JSON.stringify(entries)}`];
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

  const autoMissing = resolveBlender({
    env: {},
    exists: () => false,
    listProgramFiles: () => [],
    platform: 'win32',
    probe: () => ({ detail: 'missing', ok: false, version: '' }),
  });
  check('Blender resolver distinguishes auto-missing from configured failure', autoMissing.command === null && autoMissing.error === null);

  const explicitMissing = resolveBlender({ env: { BLENDER_EXE: 'C:\\missing\\blender.exe' }, exists: () => false });
  check('Blender resolver fails explicit missing BLENDER_EXE without fallback', explicitMissing.command === null && /does not exist/.test(explicitMissing.error));
  const explicitUnlaunchable = resolveBlender({
    env: { BLENDER_EXE: 'blender-custom' },
    probe: () => ({ detail: 'EPERM', ok: false, version: '' }),
  });
  check('Blender resolver fails explicit unlaunchable BLENDER_EXE without fallback', explicitUnlaunchable.command === null && /could not be launched/.test(explicitUnlaunchable.error));
  const explicitWrongVersion = resolveBlender({
    env: { BLENDER_EXE: 'blender-custom' },
    probe: () => ({ detail: '', ok: true, version: 'Blender 4.3.0' }),
  });
  check('Blender resolver fails explicit wrong-version BLENDER_EXE without fallback', explicitWrongVersion.command === null && /must be Blender 5\.1/.test(explicitWrongVersion.error));

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
  const installer = exists('scripts/install-hooks.mjs') ? read('scripts/install-hooks.mjs') : '';
  const lefthook = exists('lefthook.yml') ? read('lefthook.yml') : '';
  const bridge = exists('blender_addon/blueprints_addon/bridge.py') ? read('blender_addon/blueprints_addon/bridge.py') : '';
  const addonEntrypoint = exists('blender_addon/blueprints_addon/__init__.py') ? read('blender_addon/blueprints_addon/__init__.py') : '';
  const blenderRunner = exists('scripts/run-blender-smoke.mjs') ? read('scripts/run-blender-smoke.mjs') : '';
  const packageRelease = exists('scripts/package_release.py') ? read('scripts/package_release.py') : '';
  const migration = exists('docs/agent/migration-inventory.md') ? read('docs/agent/migration-inventory.md') : '';

  checkFrozenLive(
    'FD-001',
    'selected add-on and backend scope exists',
    /app_stack\s*=\s*"blender-addon-backend"/.test(config)
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
      && nativeHookErrors(installer).length === 0
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

if (exists('scripts/run-python-tests.mjs')) {
  const pythonRunner = read('scripts/run-python-tests.mjs');
  check('Python test runner includes Blender bridge unit tests', /blender_addon\/tests/.test(pythonRunner));
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
  const installer = read('scripts/install-hooks.mjs');
  const errors = nativeHookErrors(installer);
  check('native Git hook installer has the exact pre-commit and pre-push map', errors.length === 0, errors.join('; '));
  check(
    'native Git hook negative fixture rejects pre-commit drift',
    nativeHookErrors(installer.replace('npm run quality:fast', 'npm run verify')).length > 0,
  );
  check(
    'native Git hook negative fixture rejects pre-push drift',
    nativeHookErrors(installer.replace('npm run codex:ship', 'npm run quality:deep')).length > 0,
  );
  check('hooks installer marks owned hooks', /managed-by: 3d_in_blueprints-codex-infra/.test(installer));
  check('hooks installer refuses unmanaged hooks', /Refusing to overwrite unmanaged Git hook/.test(installer));
  check('hooks installer can adopt legacy managed hooks', /legacyHookBody/.test(installer) && /legacyOwned/.test(installer));
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
