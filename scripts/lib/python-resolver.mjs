import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

export function resolvePython({
  env = process.env,
  exists = existsSync,
  platform = process.platform,
  root = process.cwd(),
  spawn = spawnSync,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
} = {}) {
  requireRoot(root);
  requirePositiveTimeout(timeoutMs);
  const candidates = [
    env.PYTHON ? { command: env.PYTHON, args: [] } : null,
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
    bundledCodexPython({ env, exists, platform }),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canRunPython(candidate, { env, root, spawn, timeoutMs })) {
      return { command: candidate.command, args: [...candidate.args] };
    }
  }
  return null;
}

function bundledCodexPython({ env, exists, platform }) {
  const home = env.USERPROFILE || env.HOME;
  if (!home) return null;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const executable = pathApi.join(
    home,
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    platform === 'win32' ? 'python.exe' : 'bin/python',
  );
  try {
    return exists(executable) ? { command: executable, args: [] } : null;
  } catch {
    return null;
  }
}

function canRunPython(candidate, { env, root, spawn, timeoutMs }) {
  let result;
  try {
    result = spawn(candidate.command, [...candidate.args, '--version'], {
      cwd: root,
      encoding: 'utf8',
      env,
      killSignal: 'SIGTERM',
      shell: false,
      timeout: timeoutMs,
      windowsHide: true,
    });
  } catch {
    return false;
  }
  return Boolean(result)
    && !result.error
    && !result.signal
    && result.status === 0;
}

function requirePositiveTimeout(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('timeoutMs must be a positive integer');
  }
}

function requireRoot(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('root must be a non-empty string');
  }
}
