import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDir, '..');
const DEFAULT_FS = Object.freeze({ lstatSync, readdirSync });

export const PYTHON_TEST_ROOTS = Object.freeze([
  'backend/tests',
  'blender_addon/tests',
]);

export const PYTHON_TEST_MODULES = Object.freeze([
  'backend/tests/test_cli.py',
  'backend/tests/test_job_contracts.py',
  'backend/tests/test_packaging.py',
  'backend/tests/test_svg_ids.py',
  'blender_addon/tests/test_bridge_unit.py',
  'blender_addon/tests/test_operator_flow.py',
  'blender_addon/tests/test_preview.py',
]);

export function inspectPythonTestInventory({
  expectedModules = PYTHON_TEST_MODULES,
  fsApi = DEFAULT_FS,
  root = repositoryRoot,
  roots = PYTHON_TEST_ROOTS,
} = {}) {
  const resolvedRoot = path.resolve(requireString(root, 'root'));
  const diagnostics = pythonTestContractDiagnostics({ expectedModules, roots });
  const files = [];
  if (diagnostics.length > 0) return { diagnostics, files };

  function fail(operation, relativePath, error) {
    diagnostics.push({
      detail: errorDetail(error),
      kind: 'python-test-inventory',
      operation,
      path: normalizeRelative(relativePath),
    });
  }

  function hasExactRootPath(rawRelative) {
    let absoluteParent = resolvedRoot;
    let relativeParent = '';
    for (const component of rawRelative.split('/')) {
      let entries;
      try {
        entries = fsApi.readdirSync(absoluteParent, { withFileTypes: true });
      } catch (error) {
        fail('readdir', relativeParent || '.', error);
        return false;
      }
      const names = entries.map((entry) => typeof entry === 'string' ? entry : entry.name);
      if (!names.includes(component)) {
        const relative = path.posix.join(relativeParent, component);
        fail('spelling', relative, new Error('required Python test root component is missing with exact case'));
        return false;
      }

      const relative = path.posix.join(relativeParent, component);
      const absolute = path.join(absoluteParent, component);
      let stat;
      try {
        stat = fsApi.lstatSync(absolute);
      } catch (error) {
        fail('lstat', relative, error);
        return false;
      }
      if (stat.isSymbolicLink()) {
        fail('lstat', relative, new Error('symbolic links and junctions are not allowed'));
        return false;
      }
      if (!stat.isDirectory()) {
        fail('lstat', relative, new Error('required Python test root path component must be a directory'));
        return false;
      }
      absoluteParent = absolute;
      relativeParent = relative;
    }
    return true;
  }

  function walk(rawRelative, requiredRoot = false) {
    const relative = normalizeRelative(rawRelative);
    const absolute = path.resolve(resolvedRoot, relative);
    if (!isWithinRepository(absolute, resolvedRoot)) {
      fail('resolve', relative, new Error('path escapes repository root'));
      return;
    }

    let stat;
    try {
      stat = fsApi.lstatSync(absolute);
    } catch (error) {
      fail('lstat', relative, error);
      return;
    }

    if (stat.isSymbolicLink()) {
      fail('lstat', relative, new Error('symbolic links and junctions are not allowed'));
      return;
    }

    if (stat.isFile()) {
      if (requiredRoot) {
        fail('lstat', relative, new Error('required Python test root must be a directory'));
        return;
      }
      if (isPythonDiscoveryPackageMarker(relative)) {
        fail('inventory', relative, new Error('nested Python discovery package markers are not allowed'));
        return;
      }
      if (isPythonTestModule(relative)) files.push(relative);
      return;
    }

    if (!stat.isDirectory()) {
      fail('lstat', relative, new Error('unsupported filesystem entry type'));
      return;
    }

    if (!requiredRoot && isPythonTestModule(relative)) {
      fail('lstat', relative, new Error('Python test module path must be a regular file'));
      return;
    }

    let entries;
    try {
      entries = fsApi.readdirSync(absolute, { withFileTypes: true });
    } catch (error) {
      fail('readdir', relative, error);
      return;
    }

    const names = entries
      .map((entry) => typeof entry === 'string' ? entry : entry.name)
      .sort(compareCodePoints);
    for (const name of names) {
      if (!isSafeEntryName(name)) {
        fail('readdir', relative, new Error(`invalid directory entry name: ${String(name)}`));
        continue;
      }
      walk(path.posix.join(relative, name));
    }
  }

  for (const relativeRoot of roots) {
    const before = files.length;
    if (hasExactRootPath(relativeRoot)) walk(relativeRoot, true);
    if (files.length === before) {
      fail('inventory', relativeRoot, new Error('no test_*.py modules were discovered under the required root'));
    }
  }

  files.sort(compareCodePoints);
  for (let index = 1; index < files.length; index += 1) {
    if (files[index - 1] === files[index]) {
      fail('inventory', files[index], new Error('duplicate Python test module was discovered'));
    }
  }
  const actual = new Set(files);
  const expected = new Set(expectedModules);
  for (const expectedModule of expectedModules) {
    if (!actual.has(expectedModule)) {
      fail('inventory', expectedModule, new Error('required Python test module is missing'));
    }
  }
  for (const actualModule of files) {
    if (!expected.has(actualModule)) {
      fail('inventory', actualModule, new Error('unexpected Python test module is not in the exact allowlist'));
    }
  }

  return { diagnostics, files };
}

function formatPythonTestInventoryDiagnostic(diagnostic) {
  const operation = diagnostic.operation ? `${diagnostic.operation}: ` : '';
  return `[FAIL] Python test inventory: ${diagnostic.path} - ${operation}${diagnostic.detail}`;
}

export function main({
  env = process.env,
  fsApi = DEFAULT_FS,
  logger = console,
  root = repositoryRoot,
  spawn = spawnSync,
} = {}) {
  let inventory;
  try {
    inventory = inspectPythonTestInventory({ fsApi, root });
  } catch (error) {
    logger.error(`[FAIL] Python test inventory could not be inspected: ${errorDetail(error)}`);
    return 1;
  }
  if (inventory.diagnostics.length > 0) {
    for (const diagnostic of inventory.diagnostics) {
      logger.error(formatPythonTestInventoryDiagnostic(diagnostic));
    }
    return 1;
  }

  const selected = pythonCandidates(env).find((candidate) => (
    canRunPython(candidate, { cwd: root, spawn })
  ));
  if (!selected) {
    logger.error('[FAIL] Python interpreter not found. Set PYTHON or install python3/python.');
    return 1;
  }

  const testEnv = {
    ...env,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPATH: prependPaths([
      path.join(root, 'backend', 'src'),
      path.join(root, 'blender_addon'),
    ], env.PYTHONPATH || ''),
  };

  let failed = false;
  for (const suite of PYTHON_TEST_ROOTS) {
    let result;
    try {
      result = spawn(selected.command, [
        ...selected.args,
        '-m',
        'unittest',
        'discover',
        '-s',
        suite,
        '-p',
        'test_*.py',
      ], {
        cwd: root,
        env: testEnv,
        stdio: 'inherit',
        windowsHide: true,
      });
    } catch (error) {
      logger.error(`[FAIL] Python unittest discovery for ${suite} could not start: ${errorDetail(error)}`);
      failed = true;
      continue;
    }
    if (result?.status !== 0) {
      if (result?.error) {
        logger.error(`[FAIL] Python unittest discovery for ${suite}: ${errorDetail(result.error)}`);
      } else if (result?.signal) {
        logger.error(`[FAIL] Python unittest discovery for ${suite} terminated by ${result.signal}.`);
      } else if (result?.status === null || result?.status === undefined) {
        logger.error(`[FAIL] Python unittest discovery for ${suite} returned no exit status.`);
      }
      failed = true;
    }
  }

  return failed ? 1 : 0;
}

function pythonTestContractDiagnostics({ expectedModules, roots }) {
  const diagnostics = [];
  const fail = (pathValue, detail) => diagnostics.push({
    detail,
    kind: 'python-test-inventory',
    operation: 'contract',
    path: pathValue,
  });

  if (!Array.isArray(roots) || roots.length === 0) {
    fail('<roots>', 'Python test roots must be a non-empty array');
    return diagnostics;
  }
  if (!Array.isArray(expectedModules) || expectedModules.length === 0) {
    fail('<modules>', 'Python test module allowlist must be a non-empty array');
    return diagnostics;
  }

  const normalizedRoots = normalizedContractEntries(roots, '<roots>', fail);
  const normalizedModules = normalizedContractEntries(expectedModules, '<modules>', fail);
  if (diagnostics.length > 0) return diagnostics;

  if (!isStrictlySorted(normalizedRoots)) {
    fail('<roots>', 'Python test roots must be unique and sorted by code point');
  }
  if (!isStrictlySorted(normalizedModules)) {
    fail('<modules>', 'Python test module allowlist must be unique and sorted by code point');
  }

  for (const modulePath of normalizedModules) {
    if (!isPythonTestModule(modulePath)) {
      fail(modulePath, 'allowlisted module must match test_*.py');
      continue;
    }
    const owners = normalizedRoots.filter((rootPath) => isWithinRelative(modulePath, rootPath));
    if (owners.length !== 1) {
      fail(modulePath, 'allowlisted module must belong to exactly one required test root');
    }
  }
  return diagnostics;
}

function normalizedContractEntries(values, label, fail) {
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      fail(`${label}[${index}]`, 'contract path must be a non-empty string');
      return '';
    }
    const withForwardSlashes = value.replaceAll('\\', '/');
    const normalized = path.posix.normalize(withForwardSlashes);
    if (
      withForwardSlashes !== value
      || normalized !== value
      || normalized === '.'
      || normalized.startsWith('../')
      || path.posix.isAbsolute(normalized)
      || /^[A-Za-z]:/.test(normalized)
      || normalized.startsWith('//')
    ) {
      fail(value, 'contract path must be normalized, repository-relative, and use forward slashes');
    }
    return normalized;
  });
}

function pythonCandidates(env) {
  return [
    fromEnv(env),
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
    bundledCodexPython(env),
  ].filter(Boolean);
}

function fromEnv(env) {
  const command = env.PYTHON;
  return command ? { command, args: [] } : null;
}

function bundledCodexPython(env) {
  const home = env.USERPROFILE || env.HOME;
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

function canRunPython(candidate, { cwd, spawn }) {
  try {
    const result = spawn(candidate.command, [...candidate.args, '--version'], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    return result?.status === 0;
  } catch {
    return false;
  }
}

function prependPaths(entries, existing) {
  const prefix = entries.filter(Boolean).join(path.delimiter);
  if (!prefix) return existing;
  if (!existing) return prefix;
  return `${prefix}${path.delimiter}${existing}`;
}

function normalizeRelative(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

function isPythonTestModule(relativePath) {
  return /^test_.*\.py$/i.test(path.posix.basename(relativePath));
}

function isPythonDiscoveryPackageMarker(relativePath) {
  return /^__init__\.py$/i.test(path.posix.basename(relativePath));
}

function isSafeEntryName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !value.includes('\\');
}

function isWithinRepository(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function isWithinRelative(candidate, parent) {
  return candidate.startsWith(`${parent}/`);
}

function isStrictlySorted(values) {
  for (let index = 1; index < values.length; index += 1) {
    if (compareCodePoints(values[index - 1], values[index]) >= 0) return false;
  }
  return true;
}

function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorDetail(error) {
  if (!error) return 'unknown error';
  const code = typeof error.code === 'string' ? `${error.code}: ` : '';
  const message = typeof error.message === 'string' && error.message ? error.message : String(error);
  return `${code}${message}`;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
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
