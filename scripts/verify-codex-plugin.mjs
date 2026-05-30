import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const pluginName = 'blueprints-codex';
const pluginRoot = path.join(root, 'plugins', pluginName);
const requiredSkills = [
  'blueprints-session-bootstrap',
  'blueprints-rules',
  'blueprints-context-keeper',
  'blueprints-audit-orchestrator',
  'blueprints-spec-guardian',
  'blueprints-frozen-decisions',
  'blueprints-quality-gate',
  'blueprints-quality-tooling',
  'blueprints-instruction-drift',
  'blueprints-deadwood-audit',
  'blueprints-reuse-audit',
  'blueprints-visual-qa',
  'blueprints-visual-review',
  'blueprints-run-5sec',
  'blueprints-ship',
  'blueprints-code-rules',
  'blueprints-assets',
  'blueprints-copy',
  'blueprints-motion',
  'blueprints-a11y-seo-deploy',
  'blueprints-windows-exe-profile',
  'blueprints-blender-addon-profile',
];

const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, condition: Boolean(condition), detail });
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8'));
}

function exists(rel) {
  return existsSync(path.join(root, rel));
}

function skillBody(name) {
  return readFileSync(path.join(pluginRoot, 'skills', name, 'SKILL.md'), 'utf8');
}

function parseFrontmatter(body) {
  if (!body.startsWith('---\n')) return null;
  const end = body.indexOf('\n---', 4);
  if (end === -1) return null;
  const fields = new Map();
  for (const line of body.slice(4, end).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line);
    if (match) fields.set(match[1], match[2]);
  }
  return fields;
}

check('marketplace exists', exists('.agents/plugins/marketplace.json'));
check('plugin manifest exists', exists('plugins/blueprints-codex/.codex-plugin/plugin.json'));
check('skills root exists', exists('plugins/blueprints-codex/skills'));

if (exists('.agents/plugins/marketplace.json')) {
  const marketplace = readJson('.agents/plugins/marketplace.json');
  const entry = marketplace.plugins?.find((item) => item.name === pluginName);
  check('marketplace name set', marketplace.name === '3d-in-blueprints-local');
  check('marketplace display name set', Boolean(marketplace.interface?.displayName));
  check('marketplace lists blueprints-codex', Boolean(entry));
  check('marketplace path is repo-local', entry?.source?.path === './plugins/blueprints-codex');
  check('marketplace installation policy set', entry?.policy?.installation === 'AVAILABLE');
  check('marketplace authentication policy set', entry?.policy?.authentication === 'ON_INSTALL');
  check('marketplace category set', entry?.category === 'Productivity');
}

if (exists('plugins/blueprints-codex/.codex-plugin/plugin.json')) {
  const manifest = readJson('plugins/blueprints-codex/.codex-plugin/plugin.json');
  check('plugin name matches folder', manifest.name === pluginName);
  check('plugin exposes skills directory', manifest.skills === './skills/');
  check('plugin display name set', Boolean(manifest.interface?.displayName));
  check('plugin default prompts mention bootstrap', manifest.interface?.defaultPrompt?.some((line) => line.includes('blueprints-session-bootstrap')));
}

if (exists('plugins/blueprints-codex/skills')) {
  const skillDirs = readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expected = [...requiredSkills].sort();
  const missing = expected.filter((name) => !skillDirs.includes(name));
  const extra = skillDirs.filter((name) => !expected.includes(name));
  check('skill inventory has no missing skills', missing.length === 0, missing.join(', '));
  check('skill inventory has no extra skills', extra.length === 0, extra.join(', '));

  for (const name of requiredSkills) {
    check(`skill exists: ${name}`, skillDirs.includes(name));
  }

  for (const name of skillDirs) {
    const skillPath = `plugins/blueprints-codex/skills/${name}/SKILL.md`;
    const agentPath = `plugins/blueprints-codex/skills/${name}/agents/openai.yaml`;
    check(`skill has SKILL.md: ${name}`, exists(skillPath));
    check(`skill has agents/openai.yaml: ${name}`, exists(agentPath));
    if (exists(skillPath)) {
      const body = skillBody(name);
      const frontmatter = parseFrontmatter(body);
      check(`skill has valid frontmatter: ${name}`, Boolean(frontmatter));
      check(`skill frontmatter name: ${name}`, frontmatter?.get('name') === name);
      check(`skill description trigger: ${name}`, /^Use when /.test(frontmatter?.get('description') || ''));
      check(`skill has overview: ${name}`, /^## Overview/m.test(body));
    }
    if (exists(agentPath)) {
      const agentBody = readFileSync(path.join(root, agentPath), 'utf8');
      check(`skill OpenAI agent has short_description: ${name}`, /^short_description:\s*\S+/m.test(agentBody));
      check(`skill OpenAI agent has default_prompt: ${name}`, /^default_prompt:\s*\S+/m.test(agentBody));
    }
  }
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
