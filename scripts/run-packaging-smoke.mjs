import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './lib/python-resolver.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDir, '..');

export function main({
  env = process.env,
  logger = console,
  pythonResolver = resolvePython,
  root = repositoryRoot,
  spawn = spawnSync,
} = {}) {
  const selected = pythonResolver({ env, root, spawn });
  if (!selected) {
    logger.error('[FAIL] Python interpreter not found. Set PYTHON or install python3/python.');
    return 1;
  }

  const packageScript = path.join(root, 'scripts', 'package_release.py');
  let result;
  try {
    result = spawn(selected.command, [
      ...selected.args,
      packageScript,
      '--smoke',
    ], {
      cwd: root,
      env: {
        ...env,
        PYTHONDONTWRITEBYTECODE: '1',
      },
      stdio: 'inherit',
      windowsHide: true,
    });
  } catch (error) {
    logger.error(`[FAIL] Packaging smoke could not start: ${errorDetail(error)}`);
    return 1;
  }

  if (result?.error) {
    logger.error(`[FAIL] Packaging smoke could not start: ${errorDetail(result.error)}`);
    return 1;
  }
  if (result?.signal) {
    logger.error(`[FAIL] Packaging smoke terminated by ${result.signal}.`);
    return 1;
  }
  if (result?.status === null || result?.status === undefined) {
    logger.error('[FAIL] Packaging smoke returned no exit status.');
    return 1;
  }
  if (result.status !== 0) {
    logger.error(
      `[FAIL] Packaging smoke exited with status ${result.status}; see inherited child output above.`,
    );
    return 1;
  }
  return 0;
}

if (sameFilesystemPath(process.argv[1] || '', scriptPath)) {
  process.exitCode = main();
}

function sameFilesystemPath(left, right) {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function errorDetail(error) {
  if (!error) return 'unknown error';
  const code = typeof error.code === 'string' && error.code ? `${error.code}: ` : '';
  const message = typeof error.message === 'string' && error.message ? error.message : String(error);
  return `${code}${message}`;
}
