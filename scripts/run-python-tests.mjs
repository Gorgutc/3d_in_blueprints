import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const backendSrc = path.join(root, 'backend', 'src');

const candidates = [
  fromEnv(),
  { command: 'python3', args: [] },
  { command: 'python', args: [] },
  { command: 'py', args: ['-3'] },
  bundledCodexPython(),
].filter(Boolean);

const selected = candidates.find((candidate) => canRunPython(candidate));

if (!selected) {
  console.error('[FAIL] Python interpreter not found. Set PYTHON or install python3/python.');
  process.exit(1);
}

const env = {
  ...process.env,
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONPATH: prependPath(backendSrc, process.env.PYTHONPATH || ''),
};

const result = spawnSync(selected.command, [
  ...selected.args,
  '-m',
  'unittest',
  'discover',
  '-s',
  'backend/tests',
  '-p',
  'test_*.py',
], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
});

process.exitCode = result.status ?? 1;

function fromEnv() {
  const command = process.env.PYTHON;
  return command ? { command, args: [] } : null;
}

function bundledCodexPython() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  const executable = path.join(
    home,
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    process.platform === 'win32' ? 'python.exe' : 'bin/python'
  );
  return existsSync(executable) ? { command: executable, args: [] } : null;
}

function canRunPython(candidate) {
  const result = spawnSync(candidate.command, [...candidate.args, '--version'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0;
}

function prependPath(entry, existing) {
  if (!existing) return entry;
  return `${entry}${path.delimiter}${existing}`;
}
