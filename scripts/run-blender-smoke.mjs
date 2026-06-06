import { existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const smokeScript = path.join(root, 'blender_addon', 'tests', 'smoke_blender_bridge.py');

const blender = resolveBlender();
if (!blender) {
  console.error('Blender 5.1 was not found. Set BLENDER_EXE to the Blender 5.1 executable.');
  process.exit(1);
}

const version = blenderVersion(blender);
if (!/\bBlender 5\.1\b/.test(version)) {
  console.error(`Expected Blender 5.1, got: ${firstLine(version)}`);
  process.exit(1);
}

const env = {
  ...process.env,
  BLUEPRINTS_REPO_ROOT: root,
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONPATH: [
    path.join(root, 'backend', 'src'),
    path.join(root, 'blender_addon'),
    process.env.PYTHONPATH || '',
  ].filter(Boolean).join(path.delimiter),
};

const result = spawnSync(blender, [
  '--background',
  '--factory-startup',
  '--python',
  smokeScript,
], {
  cwd: root,
  encoding: 'utf8',
  env,
  windowsHide: true,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
cleanupPythonCaches();
process.exitCode = result.status === 0 ? 0 : 1;

function resolveBlender() {
  const candidates = [];
  if (process.env.BLENDER_EXE) candidates.push(process.env.BLENDER_EXE);
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender-5.1-DLSS-Package\\blender.exe',
    );
    candidates.push(...programFilesBlender51());
  }
  candidates.push('blender');

  for (const candidate of unique(candidates)) {
    const isPath = candidate.includes('\\') || candidate.includes('/');
    if (isPath && !existsSync(candidate)) continue;
    const version = blenderVersion(candidate);
    if (/\bBlender 5\.1\b/.test(version)) return candidate;
  }
  return null;
}

function programFilesBlender51() {
  const rootDir = 'C:\\Program Files\\Blender Foundation';
  try {
    return readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /5\.1/i.test(entry.name))
      .map((entry) => path.join(rootDir, entry.name, 'blender.exe'));
  } catch {
    return [];
  }
}

function blenderVersion(executable) {
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return '';
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function firstLine(value) {
  return String(value).split(/\r?\n/)[0] || '<empty>';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanupPythonCaches() {
  for (const rel of ['backend', 'blender_addon']) {
    removeCacheDirs(path.join(root, rel));
  }
}

function removeCacheDirs(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === '__pycache__') {
      rmSync(fullPath, { recursive: true, force: true });
      continue;
    }
    removeCacheDirs(fullPath);
  }
}
