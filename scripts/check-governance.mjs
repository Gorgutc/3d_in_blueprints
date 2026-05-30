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
  for (const entry of readdirSync(start, { withFileTypes: true })) {
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
  '.codex/config.toml',
  '.codex/hooks.json',
  ...listFiles('.codex/hooks'),
  ...listFiles('.codex/agents'),
  ...listFiles('plugins/blueprints-codex'),
  ...listFiles('docs/agent').filter((file) => !file.includes('/migration-inventory.md')),
  ...listFiles('scripts'),
  'package.json',
  'lefthook.yml',
  '.github/workflows/codex-infra.yml',
].filter(exists);

const stalePassTotals = /\b(?:56\/56|119\/119|32\/32|\d+\/\d+\s+PASS)\b/i;
const staleProjectRules = [
  { name: 'PL_RU-only instruction', pattern: /\bPL_RU Codex Source of Truth\b/i },
  { name: 'Codex Studio-only instruction', pattern: /\bCodex Studio Agent Rules\b/i },
  { name: 'Blueprint active design rule', pattern: /\bBlueprint Design Skill\b/i },
  { name: 'OSIRIS active design rule', pattern: /\bOSIRIS Design Skill\b/i },
  { name: 'Next React stack lock', pattern: /\bNext\.js\s+16\b|\bReact\s+19\b/i },
  { name: 'static-site stack lock', pattern: /\bstatic vanilla HTML\/CSS\/JS site\b/i },
  { name: 'old Claude-only workflow', pattern: /\binvoke \/ship before writing files\b/i },
];

for (const file of activeFiles) {
  const body = read(file);
  check(`${file}: no stale pass total`, !stalePassTotals.test(body));
  for (const rule of staleProjectRules) {
    check(`${file}: no ${rule.name}`, !rule.pattern.test(body));
  }
}

const codexConfig = read('.codex/config.toml');
const windowsProfile = profileBlock(codexConfig, 'windows-exe');
const blenderProfile = profileBlock(codexConfig, 'blender-addon');
check('windows profile is dormant', /status\s*=\s*"dormant"/.test(windowsProfile) && /Profile id: `windows-exe`\./.test(read('docs/agent/profiles/windows-exe.md')));
check('blender profile is dormant', /status\s*=\s*"dormant"/.test(blenderProfile) && /Profile id: `blender-addon`\./.test(read('docs/agent/profiles/blender-addon.md')));
check('README keeps app stack unselected', /No application stack is selected yet\./.test(read('README.md')));
check('package description rejects app stack lock', /not the future app stack/i.test(read('package.json')));

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
