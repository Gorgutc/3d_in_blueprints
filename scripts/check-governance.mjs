import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseConfigProfileStatuses,
  parseProfileStateClaims,
} from './lib/profile-claim-parser.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const checks = [];
const GOVERNANCE_PROFILE_ALIASES = Object.freeze({
  'blender-addon': Object.freeze(['blender-addon', 'Blender add-on']),
  'windows-exe': Object.freeze(['windows-exe', 'Windows executable', 'Windows EXE']),
});
const GOVERNANCE_PROFILE_STATES = Object.freeze({
  'blender-addon': 'active',
  'windows-exe': 'dormant',
});

function check(name, condition, detail = '') {
  checks.push({ name, condition: Boolean(condition), detail });
}

function exists(rel) {
  return existsSync(path.join(root, rel));
}

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function listFiles(startRel) {
  const start = path.join(root, startRel);
  if (!existsSync(start)) return [];
  const stat = statSync(start);
  if (stat.isFile()) return [startRel];
  const files = [];
  const entries = readdirSync(start, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = path.join(startRel, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) files.push(...listFiles(rel));
    if (entry.isFile()) files.push(rel);
  }
  return files;
}

function listRootMarkdownFiles() {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name);
}

const activeFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'DO_NOT_PUSH.md',
  ...listFiles('.agents/plugins'),
  '.codex/config.toml',
  '.codex/hooks.json',
  ...listFiles('.codex/hooks'),
  ...listFiles('.codex/agents'),
  ...listFiles('plugins/blueprints-codex'),
  ...listFiles('docs/agent').filter((file) => !file.includes('/migration-inventory.md') && !file.includes('/adrs/')),
  ...listFiles('docs/release'),
  ...listFiles('scripts'),
  'package.json',
  'lefthook.yml',
  '.github/workflows/codex-infra.yml',
].filter(exists).sort((a, b) => a.localeCompare(b));
const referenceFiles = [
  'docs/agent/migration-inventory.md',
  ...listFiles('docs/agent/adrs'),
].filter(exists).sort((a, b) => a.localeCompare(b));
const historicalFiles = listFiles('docs/handoff').filter(exists).sort((a, b) => a.localeCompare(b));
const profileClaimFiles = [
  ...listRootMarkdownFiles(),
  ...listFiles('.agents/plugins').filter((file) => file.endsWith('.json')),
  ...listFiles('.codex/agents'),
  '.codex/hooks.json',
  ...listFiles('.codex/hooks'),
  'plugins/blueprints-codex/.codex-plugin/plugin.json',
  ...listFiles('plugins/blueprints-codex/skills').filter((file) => (
    file.endsWith('/SKILL.md') || /\/agents\/openai\.ya?ml$/i.test(file)
  )),
  ...listFiles('docs/agent').filter((file) => (
    file !== 'docs/agent/migration-inventory.md' && !file.includes('/adrs/')
  )),
  ...listFiles('docs/release'),
].filter(exists).sort((a, b) => a.localeCompare(b));

const stalePassTotals = /\b\d+\/\d+\s+(?:(?:checks?|PASS(?:ED)?)(?:\s+and)?\s*(?:0\s+FAIL)?|0\s+FAIL)\b/i;
const staleProjectRules = [
  { name: 'PL_RU-only instruction', pattern: /\bPL_RU Codex Source of Truth\b/i },
  { name: 'Codex Studio-only instruction', pattern: /\bCodex Studio Agent Rules\b/i },
  { name: 'Blueprint active design rule', pattern: /\bBlueprint Design Skill\b/i },
  { name: 'OSIRIS active design rule', pattern: /\bOSIRIS Design Skill\b/i },
  { name: 'Next React stack lock', pattern: /\bNext\.js\s+16\b|\bReact\s+19\b/i },
  { name: 'static-site stack lock', pattern: /\bstatic vanilla HTML\/CSS\/JS site\b/i },
  { name: 'old Claude-only workflow', pattern: /\binvoke \/ship before writing files\b/i },
  { name: 'foreign pnpm command lock', pattern: /\bpnpm(?:\.cmd)?\s+(?:run\s+)?(?:verify|ship|quality)\b/i },
  { name: 'foreign verify-frozen command', pattern: /\bverify-frozen\.(?:js|ts|ps1)\b/i },
];
const staleProductPhrases = [
  { name: 'infrastructure-only state', pattern: /\bcurrent infrastructure-only state\b/i },
  { name: 'missing app components', pattern: /\bno app components yet\b/i },
  { name: 'pre-product add-on wording', pattern: /\bbefore product add-on code lands\b/i },
  { name: 'missing active product assets', pattern: /\bno product assets are active yet\b/i },
  { name: 'missing UI', pattern: /\bno UI exists\b/i },
];

function activeSurface(body, file) {
  if (file === 'docs/agent/profiles/blender-addon.md') {
    return body.split('## Historical Iteration Contracts')[0];
  }
  return body;
}

function governanceFindings(body) {
  const findings = [];
  if (stalePassTotals.test(body)) findings.push('stale pass total');
  for (const rule of [...staleProjectRules, ...staleProductPhrases]) {
    if (rule.pattern.test(body)) findings.push(rule.name);
  }
  const units = body
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n\s*\n/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/[!?;]+|\.(?=\s|$)/)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const directPythonBan = units.some((unit) => {
    const pythonOffset = unit.search(/\bpython(?:3)?\b/i);
    if (pythonOffset < 0) return false;
    const scopeBeforePython = unit.slice(0, pythonOffset);
    if (
      /\b(?:tests?|testing|ad[- ]hoc\s+probes?|probes?)\b/i.test(scopeBeforePython)
        || /\b(?:for|during|in)\s+(?:tests?|testing|ad[- ]hoc\s+probes?|probes?)\b/i.test(unit)
    ) return false;
    return (
      /\b(?:never|do not|don't|must not|may not|cannot|can't|forbidden to)\b.{0,80}\b(?:run|invoke|execute|launch|use)\b.{0,30}\bpython(?:3)?\b/i.test(unit)
        || /\bpython(?:3)?\b.{0,80}\b(?:must|may|can|should)\b.{0,40}\bonly\b.{0,100}\b(?:npm|run-python-tests)\b/i.test(unit)
        || /\bonly\b.{0,100}\b(?:npm|run-python-tests)\b.{0,80}\b(?:may|can|must)\b.{0,40}\b(?:run|invoke|execute|launch)\b.{0,30}\bpython(?:3)?\b/i.test(unit)
    );
  });
  if (directPythonBan) findings.push('blanket direct-Python ban');
  const mandatoryRepoLedger = units.some((unit) => {
    if (!/\bITERATION_LOG\.md\b/i.test(unit)) return false;
    return (
      /\b(?:each|every|all|new|current)\b.{0,50}\b(?:iteration|session|handoff)s?\b.{0,100}\b(?:must|required|mandatory|append(?:ed)?|record(?:ed)?|writ(?:e|ten)|updat(?:e|ed)|log(?:ged)?)\b/i.test(unit)
        || /\b(?:append|record|write|update|log)\w*\b.{0,100}\bITERATION_LOG\.md\b.{0,100}\b(?:each|every|all|new|current)\b.{0,50}\b(?:iteration|session|handoff)s?\b/i.test(unit)
        || /\bITERATION_LOG\.md\b.{0,100}\b(?:must|required|mandatory)\b.{0,80}\b(?:iteration|session|handoff)s?\b/i.test(unit)
    );
  });
  if (mandatoryRepoLedger) findings.push('mandatory repository iteration ledger');
  return findings;
}

function profileStateErrors(config) {
  const errors = [];
  for (const [profileId, expectedState] of Object.entries(GOVERNANCE_PROFILE_STATES)) {
    const statuses = parseConfigProfileStatuses(config, profileId).map((claim) => claim.state);
    if (JSON.stringify(statuses) !== JSON.stringify([expectedState])) {
      errors.push(`${profileId} must have exactly one ${expectedState} status`);
    }
  }
  return errors;
}

function hasProfileStateClaim(source, profileName, state) {
  return parseProfileStateClaims(source, { aliases: GOVERNANCE_PROFILE_ALIASES })
    .some((claim) => claim.profileId === profileName && claim.state === state);
}

function hasImplicitProfileStateClaim(source, state) {
  const implicitClaims = parseProfileStateClaims(source, {
    aliases: {},
    implicitProfileId: 'implicit',
  });
  const explicitClaims = parseProfileStateClaims(source, { aliases: GOVERNANCE_PROFILE_ALIASES });
  return implicitClaims.some((claim) => (
    claim.state === state
      && !explicitClaims.some((explicit) => (
        explicit.state === claim.state && explicit.line === claim.line
      ))
  ));
}

function profileClaimErrors(claimSurfaces) {
  const errors = [];
  const implicitOwners = {
    'docs/agent/profiles/blender-addon.md': 'blender-addon',
    'docs/agent/profiles/windows-exe.md': 'windows-exe',
  };
  for (const [file, source] of Object.entries(claimSurfaces).sort(([left], [right]) => left.localeCompare(right))) {
    const body = activeSurface(source, file);
    const claims = parseProfileStateClaims(body, {
      aliases: GOVERNANCE_PROFILE_ALIASES,
      implicitProfileId: implicitOwners[file] ?? null,
    });
    for (const claim of claims) {
      const expectedState = GOVERNANCE_PROFILE_STATES[claim.profileId];
      if (claim.state !== expectedState) {
        errors.push(
          `${file}:${claim.line} projects ${claim.profileId}=${claim.state}; expected ${expectedState}: ${claim.text}`,
        );
      }
    }
  }
  return errors;
}

function profileParityErrors({ agents, blenderDoc, claimSurfaces = {}, config, readme, windowsDoc }) {
  const errors = [...profileStateErrors(config), ...profileClaimErrors(claimSurfaces)];
  const currentBlenderDoc = activeSurface(blenderDoc, 'docs/agent/profiles/blender-addon.md');
  const frozenDecisions = claimSurfaces['docs/agent/frozen-decisions.md'] ?? '';
  const blenderDocStatuses = [...currentBlenderDoc.matchAll(/^Status:\s*([^\r\n]+)$/gm)].map((match) => match[1]);
  const windowsDocStatuses = [...windowsDoc.matchAll(/^Status:\s*([^\r\n]+)$/gm)].map((match) => match[1]);
  if (matchCount(agents, /`blender-addon` profile is active/g) !== 1 || hasProfileStateClaim(agents, 'blender-addon', 'dormant')) errors.push('AGENTS must project only blender-addon active');
  if (matchCount(agents, /`windows-exe` profile remains dormant/g) !== 1 || hasProfileStateClaim(agents, 'windows-exe', 'active')) errors.push('AGENTS must project only windows-exe dormant');
  if (matchCount(readme, /^- Active profile: `blender-addon`\.$/gm) !== 1 || hasProfileStateClaim(readme, 'blender-addon', 'dormant')) errors.push('README must project only blender-addon active');
  if (matchCount(readme, /^- Dormant profile: `windows-exe`\./gm) !== 1 || hasProfileStateClaim(readme, 'windows-exe', 'active')) errors.push('README must project only windows-exe dormant');
  if (!hasProfileStateClaim(frozenDecisions, 'blender-addon', 'active')) errors.push('docs/agent/frozen-decisions.md must preserve FD-003 blender-addon active');
  if (!hasProfileStateClaim(frozenDecisions, 'windows-exe', 'dormant')) errors.push('docs/agent/frozen-decisions.md must preserve FD-003 windows-exe dormant');
  if (JSON.stringify(blenderDocStatuses) !== JSON.stringify(['active.']) || hasProfileStateClaim(currentBlenderDoc, 'blender-addon', 'dormant') || hasImplicitProfileStateClaim(currentBlenderDoc, 'dormant')) errors.push('Blender profile doc must project only active');
  if (JSON.stringify(windowsDocStatuses) !== JSON.stringify(['dormant.']) || hasProfileStateClaim(windowsDoc, 'windows-exe', 'active') || hasImplicitProfileStateClaim(windowsDoc, 'active')) errors.push('Windows profile doc must project only dormant');
  return errors;
}

function matchCount(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function historicalProfileErrors(body) {
  const marker = '## Historical Iteration Contracts';
  const parts = body.split(marker);
  if (parts.length !== 2) return ['historical profile marker must occur exactly once'];
  const headings = [...parts[1].matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const expected = [
    'I1 Backend Contract',
    'I2 Blender Bridge Contract',
    'I3 GOST Composer Contract',
    'I4 Dimensions Contract',
    'I5 Standards DB Contract',
    'I6 Image Assist Contract',
    'I7 Packaging + Hardening Contract',
    'I8 Runtime Contract Hardening',
    'Iteration Boundaries',
  ];
  return JSON.stringify(headings) === JSON.stringify(expected)
    ? []
    : [`historical profile headings differ: ${headings.join(', ')}`];
}

for (const file of activeFiles) {
  const body = activeSurface(read(file), file);
  check(`${file}: no stale pass total`, !stalePassTotals.test(body));
  for (const rule of staleProjectRules) {
    check(`${file}: no ${rule.name}`, !rule.pattern.test(body));
  }
  for (const phrase of staleProductPhrases) {
    check(`${file}: no ${phrase.name}`, !phrase.pattern.test(body));
  }
}

for (const findingName of ['blanket direct-Python ban', 'mandatory repository iteration ledger']) {
  const regressions = profileClaimFiles.flatMap((file) => (
    governanceFindings(activeSurface(read(file), file))
      .filter((finding) => finding === findingName)
      .map(() => file)
  ));
  check(
    `active instruction surfaces have no ${findingName}`,
    regressions.length === 0,
    regressions.join(', '),
  );
}

const allTieredFiles = [...activeFiles, ...referenceFiles, ...historicalFiles];
check('instruction surfaces have no duplicate tier ownership', new Set(allTieredFiles).size === allTieredFiles.length);
check('migration inventory is reference material', referenceFiles.includes('docs/agent/migration-inventory.md'));
check('ADRs are reference decision records', referenceFiles.some((file) => file.startsWith('docs/agent/adrs/')));
check('handoff files are append-only historical evidence', historicalFiles.includes('docs/handoff/ITERATION_LOG.md'));

for (const [name, fixture] of [
  ['stale totals', ['350', '/350 checks and 0 FAIL'].join('')],
  ['foreign source-repo rules', ['PL_', 'RU Codex Source of Truth'].join('')],
  ['pre-product phrases', ['Before product add-on ', 'code lands'].join('')],
  ['blanket direct-Python ban', 'Never run Python directly; use npm wrappers.'],
  ['single-runner Python lock', 'Python must be run only through scripts/run-python-tests.mjs.'],
  ['mandatory iteration ledger', 'Every iteration must be recorded in docs/handoff/ITERATION_LOG.md.'],
  ['mandatory session ledger', 'Update docs/handoff/ITERATION_LOG.md for each completed session.'],
]) {
  check(`governance negative fixture rejects ${name}`, governanceFindings(fixture).length > 0);
}
for (const [name, fixture] of [
  [
    'documented product and release CLIs',
    'Use python -m blueprints_backend for the product and python -B scripts/package_release.py for releases.',
  ],
  [
    'npm-scoped tests and probes',
    'Tests and ad-hoc probes must not run Python directly; use the documented npm runners.',
  ],
  [
    'closed historical ledger',
    'docs/handoff/ITERATION_LOG.md is closed through P0b; current sessions live in Second Brain.',
  ],
]) {
  check(`governance positive fixture permits ${name}`, governanceFindings(fixture).length === 0);
}

{
  const aliasClaims = parseProfileStateClaims([
    'The `blender-addon` profile is active.',
    'The Blender add-on profile remains active.',
    'Dormant profile: `windows-exe`.',
    'The Windows executable profile is dormant.',
    'The Windows EXE profile stays dormant.',
  ].join('\n'), { aliases: GOVERNANCE_PROFILE_ALIASES });
  check(
    'profile claim parser recognizes exact ids and supported aliases',
    JSON.stringify(aliasClaims.map(({ profileId, state }) => [profileId, state])) === JSON.stringify([
      ['blender-addon', 'active'],
      ['blender-addon', 'active'],
      ['windows-exe', 'dormant'],
      ['windows-exe', 'dormant'],
      ['windows-exe', 'dormant'],
    ]),
  );
  const wrappedClaims = parseProfileStateClaims(
    'Header\r\nProfile status for `windows-exe`:\r\ndormant.\r\n',
    { aliases: GOVERNANCE_PROFILE_ALIASES },
  );
  check(
    'profile claim parser preserves wrapped claim diagnostics',
    wrappedClaims.length === 1
      && wrappedClaims[0].profileId === 'windows-exe'
      && wrappedClaims[0].state === 'dormant'
      && wrappedClaims[0].line === 2
      && wrappedClaims[0].text === 'Profile status for `windows-exe`: dormant',
  );
  const normativeClaims = parseProfileStateClaims([
    'The Windows executable profile must remain active.',
    'The `windows-exe` profile should be active.',
    'The Blender add-on profile must\r\nremain dormant.',
  ].join('\n'), { aliases: GOVERNANCE_PROFILE_ALIASES });
  check(
    'profile claim parser recognizes normative and wrapped state contradictions',
    JSON.stringify(normativeClaims.map(({ profileId, state }) => [profileId, state]))
      === JSON.stringify([
        ['windows-exe', 'active'],
        ['windows-exe', 'active'],
        ['blender-addon', 'dormant'],
      ]),
  );
  const implicitNormativeClaims = parseProfileStateClaims(
    'This profile must remain active.',
    { aliases: GOVERNANCE_PROFILE_ALIASES, implicitProfileId: 'windows-exe' },
  );
  check(
    'profile claim parser recognizes implicit-owner normative contradictions',
    JSON.stringify(implicitNormativeClaims.map(({ profileId, state }) => [profileId, state]))
      === JSON.stringify([['windows-exe', 'active']]),
  );
  const clauseClaims = parseProfileStateClaims(
    'While the windows-exe profile is dormant, verify that no installer command is active.',
    { aliases: GOVERNANCE_PROFILE_ALIASES },
  );
  check(
    'profile claim parser does not attach command state to a dormant profile',
    JSON.stringify(clauseClaims.map(({ profileId, state }) => [profileId, state]))
      === JSON.stringify([['windows-exe', 'dormant']]),
  );
  check(
    'profile claim parser ignores activation verbs and partial aliases',
    parseProfileStateClaims(
      'This activates Windows executable planning; blender-addons are active.',
      { aliases: GOVERNANCE_PROFILE_ALIASES },
    ).length === 0,
  );
  const configFixture = [
    '[[profiles]]',
    'name = "windows-exe"',
    'status = "dormant"',
    '',
    '[[profiles]]',
    'name = "blender-addon"',
    'status = "active"',
  ].join('\r\n');
  const configClaims = [
    ...parseConfigProfileStatuses(configFixture, 'windows-exe'),
    ...parseConfigProfileStatuses(configFixture, 'blender-addon'),
  ];
  check(
    'profile config parser reports exact profile statuses with line context',
    JSON.stringify(configClaims) === JSON.stringify([
      { profileId: 'windows-exe', state: 'dormant', line: 3, text: 'status = "dormant"' },
      { profileId: 'blender-addon', state: 'active', line: 7, text: 'status = "active"' },
    ]),
  );
}

const codexConfig = read('.codex/config.toml');
const profileSurfaces = {
  agents: read('AGENTS.md'),
  blenderDoc: read('docs/agent/profiles/blender-addon.md'),
  claimSurfaces: Object.fromEntries(profileClaimFiles.map((file) => [file, read(file)])),
  config: codexConfig,
  readme: read('README.md'),
  windowsDoc: read('docs/agent/profiles/windows-exe.md'),
};
check('profile states match every exact active and dormant projection', profileParityErrors(profileSurfaces).length === 0);
for (const [name, mutate] of [
  ['config', (value) => { value.config = value.config.replace('status = "dormant"', 'status = "active"'); }],
  ['AGENTS', (value) => { value.agents = value.agents.replace('`windows-exe` profile remains dormant', '`windows-exe` profile is active'); }],
  ['README', (value) => { value.readme = value.readme.replace('Dormant profile: `windows-exe`.', 'Active profile: `windows-exe`.'); }],
  ['Blender profile doc', (value) => { value.blenderDoc = value.blenderDoc.replace('Status: active.', 'Status: dormant.'); }],
  ['Windows profile doc', (value) => { value.windowsDoc = value.windowsDoc.replace('Status: dormant.', 'Status: active.'); }],
  ['additive config conflict', (value) => { value.config = value.config.replace('status = "dormant"', 'status = "dormant"\nstatus = "active"'); }],
  ['additive AGENTS conflict', (value) => { value.agents += '\nThe `windows-exe` profile is active.\n'; }],
  ['paraphrased additive AGENTS conflict', (value) => { value.agents += '\nProfile status for `windows-exe`: active.\n'; }],
  ['unquoted additive AGENTS conflict', (value) => { value.agents += '\nProfile status for windows-exe: active.\n'; }],
  ['wrapped additive AGENTS conflict', (value) => { value.agents += '\nProfile status for `windows-exe`:\nactive.\n'; }],
  ['additive README conflict', (value) => { value.readme += '\n- Active profile: `windows-exe`.\n'; }],
  ['paraphrased additive README conflict', (value) => { value.readme += '\nProfile status for `blender-addon`: dormant.\n'; }],
  ['additive Blender profile conflict', (value) => {
    value.blenderDoc = value.blenderDoc.replace(
      '## Historical Iteration Contracts',
      'Profile status: dormant.\n\n## Historical Iteration Contracts',
    );
  }],
  ['additive Windows profile conflict', (value) => { value.windowsDoc += '\nStatus: active.\n'; }],
]) {
  const candidate = { ...profileSurfaces };
  mutate(candidate);
  check(`governance negative fixture rejects ${name} profile drift`, profileParityErrors(candidate).length > 0);
}
for (const [name, mutate] of [
  ['alias inversion', (value) => { value.agents += '\nThe Windows executable profile is active.\n'; }],
  ['wrapped CRLF alias inversion', (value) => {
    value.agents += '\r\nProfile status for Windows executable:\r\nactive.\r\n';
  }],
  ['unowned additive claim', (value) => {
    value.claimSurfaces['docs/agent/new-consumer.md'] = 'The windows-exe profile is active.';
  }],
]) {
  const candidate = {
    ...profileSurfaces,
    claimSurfaces: { ...profileSurfaces.claimSurfaces },
  };
  mutate(candidate);
  check(
    `governance negative fixture rejects ${name} profile drift`,
    profileParityErrors(candidate).length > 0,
  );
}
const deletedOwnerClaim = {
  ...profileSurfaces,
  agents: profileSurfaces.agents.replace('`blender-addon` profile is active', '`blender-addon` product scope'),
  claimSurfaces: { ...profileSurfaces.claimSurfaces },
};
check(
  'governance negative fixture rejects deletion of a mandatory owner claim',
  profileParityErrors(deletedOwnerClaim).length > 0,
);
const deletedFrozenDecisionClaims = {
  ...profileSurfaces,
  claimSurfaces: {
    ...profileSurfaces.claimSurfaces,
    'docs/agent/frozen-decisions.md': '',
  },
};
check(
  'governance negative fixture rejects deletion of canonical FD-003 claims',
  profileParityErrors(deletedFrozenDecisionClaims).length > 0,
);
const clauseAwareProfileProjection = {
  ...profileSurfaces,
  claimSurfaces: {
    ...profileSurfaces.claimSurfaces,
    '.codex/agents/windows_packaging_guardian.toml': [
      'The windows-exe profile is dormant, while the installer command is active.',
      'This activates Windows executable planning only after owner approval.',
    ].join('\n'),
  },
};
check(
  'governance positive fixture separates profile state from active commands',
  profileParityErrors(clauseAwareProfileProjection).length === 0,
);
const crossProfileProjection = {
  ...profileSurfaces,
  windowsDoc: `${profileSurfaces.windowsDoc}\nThe \`blender-addon\` profile is active.\n`,
};
const crossProfileErrors = profileParityErrors(crossProfileProjection);
check(
  'governance positive fixture permits an explicit cross-profile state mention',
  crossProfileErrors.length === 0,
  crossProfileErrors.join('; '),
);
const historicalErrors = historicalProfileErrors(profileSurfaces.blenderDoc);
check('Blender profile historical suffix has exact append-only headings', historicalErrors.length === 0, historicalErrors.join('; '));
check(
  'governance negative fixture rejects a current heading below the historical marker',
  historicalProfileErrors(`${profileSurfaces.blenderDoc}\n## Current Override\n`).length > 0,
);
check('project app stack is selected', /app_stack\s*=\s*"blender-addon-backend"/.test(codexConfig));
check('README describes selected product scope', /Blender add-on \+ local standalone backend/.test(read('README.md')));
check('package description rejects product runtime lock', /not the product runtime/i.test(read('package.json')));
check(
  'handoff log is historical, not active governance policy',
  historicalFiles.includes('docs/handoff/ITERATION_LOG.md')
    && !activeFiles.includes('docs/handoff/ITERATION_LOG.md')
    && /historical handoff ledger/.test(read('docs/agent/quality-tooling.md'))
);
const expectedPointers = {
  'CLAUDE.md': '# CLAUDE.md\n\nUse `AGENTS.md` as the source of truth for this repository.\n\nThis file is a compatibility pointer only. Do not add separate Claude-specific\npolicy here.\n',
  'GEMINI.md': '# GEMINI.md\n\nUse `AGENTS.md` as the source of truth for this repository.\n\nThis file is a compatibility pointer only. Do not add separate Gemini-specific\npolicy here.\n',
};
for (const [file, expected] of Object.entries(expectedPointers)) {
  check(`${file} remains pointer-only`, read(file).replace(/\r\n/g, '\n') === expected);
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
