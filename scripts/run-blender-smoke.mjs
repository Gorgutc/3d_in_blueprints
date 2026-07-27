import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const packageScript = path.join(root, 'scripts', 'package_release.py');
const sourceSmokeScript = path.join(root, 'blender_addon', 'tests', 'smoke_blender_bridge.py');
const packagedSmokeScript = path.join(root, 'blender_addon', 'tests', 'smoke_blender_packaged.py');
const blenderTimeoutMs = positiveInteger(process.env.BLUEPRINTS_BLENDER_SMOKE_TIMEOUT_MS, 180_000);
const packageTimeoutMs = positiveInteger(process.env.BLUEPRINTS_PACKAGE_SMOKE_TIMEOUT_MS, 60_000);

process.exitCode = main();

function main() {
  const blender = resolveBlender();
  if (!blender) {
    console.error('Blender 5.1 was not found or could not be launched. Set BLENDER_EXE to the Blender 5.1 executable.');
    return 1;
  }

  const version = blenderVersion(blender);
  if (!/\bBlender 5\.1\b/.test(version)) {
    console.error(`Expected Blender 5.1, got: ${firstLine(version)}`);
    return 1;
  }
  console.log(`[INFO] ${firstLine(version)}`);

  const sourceEnv = {
    ...process.env,
    BLUEPRINTS_REPO_ROOT: root,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPATH: [
      path.join(root, 'backend', 'src'),
      path.join(root, 'blender_addon'),
      process.env.PYTHONPATH || '',
    ].filter(Boolean).join(path.delimiter),
  };
  deleteEnvironmentKeys(sourceEnv, ['PYTHONOPTIMIZE']);
  const sourceResult = runCommand(blender, blenderArgs(sourceSmokeScript), {
    cwd: root,
    env: sourceEnv,
    label: 'Blender 5.1 source bridge smoke',
    timeoutMs: blenderTimeoutMs,
  });
  cleanupPythonCaches();
  if (!sourceResult) return 1;
  console.log('[PASS] Blender 5.1 source bridge smoke');

  let tempRoot;
  let passed = false;
  try {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'blueprints-blender-packaged-'));
    const layout = createPackagedLayout(tempRoot);
    const artifacts = buildRelease(layout.release);
    if (!artifacts) return 1;

    const packagedEnv = isolatedPackagedEnvironment(layout, artifacts);
    passed = runCommand(blender, blenderArgs(packagedSmokeScript), {
      cwd: layout.cwd,
      env: packagedEnv,
      label: 'Blender 5.1 packaged add-on smoke',
      timeoutMs: blenderTimeoutMs,
    });
  } finally {
    if (tempRoot) {
      try {
        removeTempRoot(tempRoot);
      } catch (error) {
        console.error(`[FAIL] Could not clean packaged smoke temp root: ${error.message}`);
        passed = false;
      }
    }
    cleanupPythonCaches();
  }

  if (!passed) return 1;
  console.log('[PASS] Blender 5.1 packaged add-on smoke');
  return 0;
}

function blenderArgs(smokeScript) {
  return [
    '--factory-startup',
    '--background',
    '--python-exit-code',
    '1',
    '--python',
    smokeScript,
  ];
}

function createPackagedLayout(tempRoot) {
  const layout = {
    config: path.join(tempRoot, 'config'),
    cwd: path.join(tempRoot, 'cwd'),
    datafiles: path.join(tempRoot, 'datafiles'),
    extensions: path.join(tempRoot, 'extensions'),
    release: path.join(tempRoot, 'release'),
    runtimeTemp: path.join(tempRoot, 'runtime-temp'),
    scripts: path.join(tempRoot, 'scripts'),
    tempRoot,
  };
  for (const directory of Object.values(layout)) mkdirSync(directory, { recursive: true });
  return layout;
}

function buildRelease(outputDir) {
  const python = resolvePython();
  if (!python) {
    console.error('[FAIL] Python interpreter not found. Set PYTHON or install python3/python.');
    return null;
  }

  const built = runCommand(python.command, [
    ...python.args,
    packageScript,
    '--output-dir',
    outputDir,
    '--commit',
    'BLENDER-PACKAGED-SMOKE',
  ], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    },
    label: 'release artifact build for Blender smoke',
    timeoutMs: packageTimeoutMs,
  });
  if (!built) return null;

  const manifestPath = path.join(outputDir, 'release_manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`[FAIL] Could not read packaged smoke manifest: ${error.message}`);
    return null;
  }

  const addonZip = artifactPath(outputDir, manifest, 'blender_addon_zip');
  const backendZip = artifactPath(outputDir, manifest, 'backend_bundle_zip');
  if (!addonZip || !backendZip) return null;
  return { addonZip, backendZip };
}

function artifactPath(outputDir, manifest, artifactId) {
  const artifact = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((candidate) => candidate.id === artifactId)
    : null;
  if (!artifact || typeof artifact.file !== 'string') {
    console.error(`[FAIL] release_manifest.json is missing ${artifactId}.`);
    return null;
  }

  const resolvedOutput = path.resolve(outputDir);
  const resolvedArtifact = path.resolve(outputDir, artifact.file);
  if (!isWithin(resolvedArtifact, resolvedOutput) || !existsSync(resolvedArtifact)) {
    console.error(`[FAIL] ${artifactId} is missing or outside the packaged smoke release directory.`);
    return null;
  }
  return resolvedArtifact;
}

function isolatedPackagedEnvironment(layout, artifacts) {
  const env = { ...process.env };
  deleteEnvironmentKeys(env, ['PYTHONPATH', 'PYTHONOPTIMIZE', 'BLUEPRINTS_REPO_ROOT']);
  return {
    ...env,
    BLENDER_USER_CONFIG: layout.config,
    BLENDER_USER_DATAFILES: layout.datafiles,
    BLENDER_USER_EXTENSIONS: layout.extensions,
    BLENDER_USER_SCRIPTS: layout.scripts,
    BLUEPRINTS_PACKAGED_ADDON_ZIP: artifacts.addonZip,
    BLUEPRINTS_PACKAGED_BACKEND_ZIP: artifacts.backendZip,
    BLUEPRINTS_PACKAGED_CHECKOUT_ROOT: root,
    BLUEPRINTS_PACKAGED_CWD: layout.cwd,
    BLUEPRINTS_PACKAGED_RUNTIME_TEMP: layout.runtimeTemp,
    BLUEPRINTS_PACKAGED_TEMP_ROOT: layout.tempRoot,
    PYTHONDONTWRITEBYTECODE: '1',
    TEMP: layout.runtimeTemp,
    TMP: layout.runtimeTemp,
    TMPDIR: layout.runtimeTemp,
  };
}

function deleteEnvironmentKeys(env, blockedKeys) {
  const normalized = new Set(blockedKeys.map((key) => key.toUpperCase()));
  for (const key of Object.keys(env)) {
    if (normalized.has(key.toUpperCase())) delete env[key];
  }
}

function runCommand(command, args, { cwd, env, label, timeoutMs }) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    killSignal: 'SIGTERM',
    stdio: 'inherit',
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error) {
    const detail = result.error.code === 'ETIMEDOUT'
      ? `timed out after ${timeoutMs} ms`
      : result.error.message;
    console.error(`[FAIL] ${label}: ${detail}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`[FAIL] ${label} exited with status ${result.status ?? '<none>'}.`);
    return false;
  }
  return true;
}

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

  for (const rawCandidate of unique(candidates)) {
    const isPath = isPathLikeBlenderCandidate(rawCandidate);
    const candidate = isPath ? path.resolve(root, rawCandidate) : rawCandidate;
    if (isPath && !existsSync(candidate)) continue;
    const version = blenderVersion(candidate);
    if (/\bBlender 5\.1\b/.test(version)) return candidate;
  }
  return null;
}

function isPathLikeBlenderCandidate(candidate) {
  return candidate.includes('\\') || candidate.includes('/') || /^[A-Za-z]:/.test(candidate);
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
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.status !== 0) return '';
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function resolvePython() {
  const candidates = [
    fromPythonEnv(),
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
    bundledCodexPython(),
  ].filter(Boolean);
  return candidates.find((candidate) => canRunPython(candidate)) || null;
}

function fromPythonEnv() {
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
    process.platform === 'win32' ? 'python.exe' : 'bin/python',
  );
  return existsSync(executable) ? { command: executable, args: [] } : null;
}

function canRunPython(candidate) {
  const result = spawnSync(candidate.command, [...candidate.args, '--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  return result.status === 0;
}

function removeTempRoot(tempRoot) {
  const resolvedTemp = path.resolve(tmpdir());
  const resolvedTarget = path.resolve(tempRoot);
  if (resolvedTarget === resolvedTemp || !isWithin(resolvedTarget, resolvedTemp)) {
    throw new Error(`refusing to remove unexpected path ${resolvedTarget}`);
  }
  rmSync(resolvedTarget, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 });
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function positiveInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
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
