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
  const result = spawn(selected.command, [
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

  return result?.status === 0 ? 0 : 1;
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
