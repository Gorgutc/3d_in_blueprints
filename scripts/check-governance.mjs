import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, condition: Boolean(condition), detail });
}

function exists(rel) {
  return existsSync(path.join(root, rel));
}

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function profileBlock(config, profileName) {
  return config
    .split(/\r?\n(?=\[\[profiles\]\])/)
    .find((block) => new RegExp(`^name\\s*=\\s*"${profileName}"`, 'm').test(block)) || '';
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
  return findings;
}

function profileStateErrors(config) {
  const errors = [];
  const windows = profileBlock(config, 'windows-exe');
  const blender = profileBlock(config, 'blender-addon');
  const windowsStatuses = [...windows.matchAll(/^status\s*=\s*"([^"]+)"\s*$/gm)].map((match) => match[1]);
  const blenderStatuses = [...blender.matchAll(/^status\s*=\s*"([^"]+)"\s*$/gm)].map((match) => match[1]);
  if (JSON.stringify(windowsStatuses) !== JSON.stringify(['dormant'])) errors.push('windows-exe must have exactly one dormant status');
  if (JSON.stringify(blenderStatuses) !== JSON.stringify(['active'])) errors.push('blender-addon must have exactly one active status');
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

function profileParityErrors({ agents, blenderDoc, config, readme, windowsDoc }) {
  const errors = [...profileStateErrors(config)];
  const currentBlenderDoc = activeSurface(blenderDoc, 'docs/agent/profiles/blender-addon.md');
  const blenderDocStatuses = [...currentBlenderDoc.matchAll(/^Status:\s*([^\r\n]+)$/gm)].map((match) => match[1]);
  const windowsDocStatuses = [...windowsDoc.matchAll(/^Status:\s*([^\r\n]+)$/gm)].map((match) => match[1]);
  if (matchCount(agents, /`blender-addon` profile is active/g) !== 1 || hasProfileStateClaim(agents, 'blender-addon', 'dormant')) errors.push('AGENTS must project only blender-addon active');
  if (matchCount(agents, /`windows-exe` profile remains dormant/g) !== 1 || hasProfileStateClaim(agents, 'windows-exe', 'active')) errors.push('AGENTS must project only windows-exe dormant');
  if (matchCount(readme, /^- Active profile: `blender-addon`\.$/gm) !== 1 || hasProfileStateClaim(readme, 'blender-addon', 'dormant')) errors.push('README must project only blender-addon active');
  if (matchCount(readme, /^- Dormant profile: `windows-exe`\./gm) !== 1 || hasProfileStateClaim(readme, 'windows-exe', 'active')) errors.push('README must project only windows-exe dormant');
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

const allTieredFiles = [...activeFiles, ...referenceFiles, ...historicalFiles];
check('instruction surfaces have no duplicate tier ownership', new Set(allTieredFiles).size === allTieredFiles.length);
check('migration inventory is reference material', referenceFiles.includes('docs/agent/migration-inventory.md'));
check('ADRs are reference decision records', referenceFiles.some((file) => file.startsWith('docs/agent/adrs/')));
check('handoff files are append-only historical evidence', historicalFiles.includes('docs/handoff/ITERATION_LOG.md'));

for (const [name, fixture] of [
  ['stale totals', ['350', '/350 checks and 0 FAIL'].join('')],
  ['foreign source-repo rules', ['PL_', 'RU Codex Source of Truth'].join('')],
  ['pre-product phrases', ['Before product add-on ', 'code lands'].join('')],
]) {
  check(`governance negative fixture rejects ${name}`, governanceFindings(fixture).length > 0);
}

const codexConfig = read('.codex/config.toml');
const windowsProfile = profileBlock(codexConfig, 'windows-exe');
const blenderProfile = profileBlock(codexConfig, 'blender-addon');
const profileSurfaces = {
  agents: read('AGENTS.md'),
  blenderDoc: read('docs/agent/profiles/blender-addon.md'),
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
const crossProfileProjection = {
  ...profileSurfaces,
  windowsDoc: `${profileSurfaces.windowsDoc}\nThe \`blender-addon\` profile is active.\n`,
};
check(
  'governance positive fixture permits an explicit cross-profile state mention',
  profileParityErrors(crossProfileProjection).length === 0,
);
const historicalErrors = historicalProfileErrors(profileSurfaces.blenderDoc);
check('Blender profile historical suffix has exact append-only headings', historicalErrors.length === 0, historicalErrors.join('; '));
check(
  'governance negative fixture rejects a current heading below the historical marker',
  historicalProfileErrors(`${profileSurfaces.blenderDoc}\n## Current Override\n`).length > 0,
);
check('windows profile is dormant', /status\s*=\s*"dormant"/.test(windowsProfile) && /Profile id: `windows-exe`\./.test(read('docs/agent/profiles/windows-exe.md')));
check('blender profile is active', /status\s*=\s*"active"/.test(blenderProfile) && /Status: active\./.test(read('docs/agent/profiles/blender-addon.md')));
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
