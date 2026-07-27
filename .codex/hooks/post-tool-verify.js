import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeVerificationPlan,
  HookPayloadError,
  planPostToolVerification,
} from '../../scripts/lib/post-tool-routing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function main({ input = readFileSync(0, 'utf8'), platform = process.platform } = {}) {
  let plan;
  try {
    plan = planPostToolVerification(input, { root });
  } catch (error) {
    const prefix = error instanceof HookPayloadError ? error.code : 'hook_internal_error';
    console.error(`[FAIL] PostToolUse payload (${prefix}): ${error.message}`);
    return 2;
  }

  if (plan.commands.length === 0) return 0;
  const outcome = executeVerificationPlan(plan.commands, (command) => runNpmCommand(command, platform));
  if (!outcome.ok) {
    const detail = outcome.result.detail ? `: ${outcome.result.detail}` : '';
    console.error(`[FAIL] ${outcome.failedCommand}${detail}`);
    return 2;
  }
  return 0;
}

function runNpmCommand(command, platform) {
  const args = command === 'quality:deep'
    ? ['run', 'quality:deep']
    : ['run', 'test:blender', '--', '--if-available'];
  let result;
  if (platform === 'win32') {
    const commandLine = `npm.cmd ${args.join(' ')}`;
    result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
  } else {
    result = spawnSync('npm', args, { cwd: root, stdio: 'inherit' });
  }
  if (result.error) return { detail: result.error.message, ok: false };
  if (result.signal) return { detail: `terminated by ${result.signal}`, ok: false };
  if (result.status !== 0) return { detail: `exited with status ${result.status ?? '<none>'}`, ok: false };
  return { ok: true };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
