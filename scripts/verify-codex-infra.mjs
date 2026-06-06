import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const checks = [];

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
  'scripts/verify-codex-infra.mjs',
  'scripts/run-python-tests.mjs',
  'scripts/install-hooks.mjs',
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

function exists(rel) {
  return existsSync(path.join(root, rel));
}

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function check(name, condition, detail = '') {
  checks.push({ name, condition: Boolean(condition), detail });
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

for (const file of requiredFiles) {
  check(`required file exists: ${file}`, exists(file));
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
    check(`agent has output contract: ${agent}`, /PASS\/FAIL/.test(instructions));
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
  const hooksText = read('.codex/hooks.json');
  const config = JSON.parse(hooksText);
  check('hooks include SessionStart', Boolean(config.hooks?.SessionStart));
  check('hooks include UserPromptSubmit', Boolean(config.hooks?.UserPromptSubmit));
  check('hooks include PostToolUse', Boolean(config.hooks?.PostToolUse));
  let commandHookCount = 0;
  for (const [eventName, eventConfigs] of Object.entries(config.hooks || {})) {
    for (const eventConfig of eventConfigs) {
      for (const hook of eventConfig.hooks || []) {
        if (hook.type !== 'command') continue;
        commandHookCount += 1;
        check(`${eventName} command hook has command`, typeof hook.command === 'string' && hook.command.length > 0);
        check(`${eventName} command hook has commandWindows`, typeof hook.commandWindows === 'string' && hook.commandWindows.length > 0);
        check(`${eventName} command hook has bounded timeout`, Number.isInteger(hook.timeout) && hook.timeout > 0 && hook.timeout <= 180);
      }
    }
  }
  check('hooks include three command hooks', commandHookCount === 3, String(commandHookCount));
  check('hooks avoid app/profile commands', !/\b(?:tauri|electron|pyinstaller|nuitka|blender|dotnet|cargo build)\b/i.test(hooksText));
  check('post-tool status names quality deep verification', /Running Codex quality:deep verification/.test(hooksText));
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
  const workflow = read('.github/workflows/codex-infra.yml');
  check('CI runs npm ci', /npm ci/.test(workflow));
  check('CI configures Python for backend tests', /actions\/setup-python@v5/.test(workflow) && /python-version:\s*'3\.12'/.test(workflow));
  check('CI runs codex ship', /npm run codex:ship/.test(workflow));
  check('CI runs npm ci before codex ship', workflow.indexOf('npm ci') < workflow.indexOf('npm run codex:ship'));
  check('CI configures Python before codex ship', workflow.indexOf('actions/setup-python@v5') < workflow.indexOf('npm run codex:ship'));
}

if (exists('package.json')) {
  const packageJson = read('package.json');
  const packageConfig = JSON.parse(packageJson);
  const scripts = packageConfig.scripts || {};
  for (const command of [
    'codex:verify-plugin',
    'check:governance',
    'check:js',
    'test:backend',
    'verify',
    'quality:fast',
    'quality:deep',
    'codex:ship',
    'hooks:install',
  ]) {
    check(`package exposes ${command}`, packageJson.includes(`"${command}"`));
  }
  check('test:backend runs Python test runner', scripts['test:backend'] === 'node scripts/run-python-tests.mjs');
  check('quality:deep runs fast gate before backend tests', /npm run quality:fast/.test(scripts['quality:deep'] || '') && /npm run test:backend/.test(scripts['quality:deep'] || ''));
  check('codex:ship runs quality:deep', scripts['codex:ship'] === 'npm run quality:deep');
}

if (exists('scripts/install-hooks.mjs')) {
  const installer = read('scripts/install-hooks.mjs');
  check('hooks installer installs pre-commit', /pre-commit/.test(installer));
  check('hooks installer installs pre-push', /pre-push/.test(installer));
  check('hooks installer is not a placeholder', !/future hook installation/i.test(installer));
  check('hooks installer marks owned hooks', /managed-by: 3d_in_blueprints-codex-infra/.test(installer));
  check('hooks installer refuses unmanaged hooks', /Refusing to overwrite unmanaged Git hook/.test(installer));
  check('hooks installer can adopt legacy managed hooks', /legacyHookBody/.test(installer) && /legacyOwned/.test(installer));
}

if (exists('.codex/hooks/post-tool-verify.js')) {
  const hookBody = read('.codex/hooks/post-tool-verify.js');
  const hookPath = path.join(root, '.codex/hooks/post-tool-verify.js');
  const infraSample = JSON.stringify({ tool_input: { file_path: 'docs\\\\agent\\\\verification.md' } });
  const backendSample = JSON.stringify({ tool_input: { file_path: 'backend\\\\src\\\\blueprints_backend\\\\cli.py' } });
  const nonInfraSample = JSON.stringify({ tool_input: { file_path: 'src\\\\app.js' } });
  const hookEnv = { ...process.env, CODEX_INFRA_POST_TOOL_DRY_RUN: '1' };
  const infraResult = spawnSync(process.execPath, [hookPath], {
    cwd: root,
    input: infraSample,
    encoding: 'utf8',
    env: hookEnv,
  });
  const backendResult = spawnSync(process.execPath, [hookPath], {
    cwd: root,
    input: backendSample,
    encoding: 'utf8',
    env: hookEnv,
  });
  const nonInfraResult = spawnSync(process.execPath, [hookPath], {
    cwd: root,
    input: nonInfraSample,
    encoding: 'utf8',
    env: hookEnv,
  });
  check('post-tool hook detects escaped Windows infra paths', infraResult.status === 0 && /would run/.test(infraResult.stdout));
  check('post-tool hook detects escaped Windows backend paths', backendResult.status === 0 && /would run/.test(backendResult.stdout));
  check('post-tool hook ignores escaped Windows non-infra paths', nonInfraResult.status === 0 && nonInfraResult.stdout === '');
  check('post-tool hook runs quality deep on Windows', /npm\.cmd run quality:deep/.test(hookBody));
  check('post-tool hook runs quality deep on POSIX', /'quality:deep'/.test(hookBody));
}

for (const script of [
  'scripts/verify-codex-plugin.mjs',
  'scripts/check-governance.mjs',
  'scripts/check-js-syntax.mjs',
  'scripts/verify-codex-infra.mjs',
  'scripts/run-python-tests.mjs',
  'scripts/install-hooks.mjs',
]) {
  if (exists(script)) {
    check(`${script} resolves repo root from script path`, /fileURLToPath\(import\.meta\.url\)/.test(read(script)));
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
