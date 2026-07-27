import { lstatSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const DEFAULT_JS_ROOTS = Object.freeze(['scripts', '.codex/hooks']);
export const DEFAULT_NODE_CHECK_TIMEOUT_MS = 30_000;

const DEFAULT_FS = Object.freeze({ lstatSync, readdirSync });

export function collectJavaScriptFiles({
  root,
  roots = DEFAULT_JS_ROOTS,
  fsApi = DEFAULT_FS,
} = {}) {
  const repositoryRoot = path.resolve(requireString(root, 'root'));
  const files = [];
  const diagnostics = [];

  function fail(operation, rel, error) {
    diagnostics.push({
      kind: 'discovery',
      operation,
      path: normalizeRelative(rel),
      detail: errorDetail(error),
    });
  }

  function walk(rawRelative, requiredRoot = false) {
    const rel = normalizeRelative(rawRelative);
    const absolute = path.resolve(repositoryRoot, rel);
    if (!isWithinRepository(absolute, repositoryRoot)) {
      fail('resolve', rel, new Error('path escapes repository root'));
      return;
    }

    let stat;
    try {
      stat = fsApi.lstatSync(absolute);
    } catch (error) {
      fail('lstat', rel, error);
      return;
    }

    if (stat.isSymbolicLink()) {
      fail('lstat', rel, new Error('symbolic links and junctions are not allowed'));
      return;
    }

    if (stat.isFile()) {
      if (requiredRoot) {
        fail('lstat', rel, new Error('required JavaScript root must be a directory'));
        return;
      }
      if (/\.(?:js|mjs|cjs)$/.test(rel)) files.push(rel);
      return;
    }

    if (!stat.isDirectory()) {
      fail('lstat', rel, new Error('unsupported filesystem entry type'));
      return;
    }

    let entries;
    try {
      entries = fsApi.readdirSync(absolute, { withFileTypes: true });
    } catch (error) {
      fail('readdir', rel, error);
      return;
    }

    const names = entries
      .map((entry) => typeof entry === 'string' ? entry : entry.name)
      .sort(compareCodePoints);
    for (const name of names) {
      walk(path.posix.join(rel, name));
    }
  }

  for (const rel of roots) walk(rel, true);
  files.sort(compareCodePoints);
  if (files.length === 0) {
    diagnostics.push({
      kind: 'discovery',
      operation: 'inventory',
      path: roots.map(normalizeRelative).join(', '),
      detail: 'no JavaScript files were discovered under the required roots',
    });
  }

  return { diagnostics, files };
}

export function checkJavaScriptFiles({
  root,
  files,
  spawn = spawnSync,
  executable = process.execPath,
  timeoutMs = DEFAULT_NODE_CHECK_TIMEOUT_MS,
} = {}) {
  const repositoryRoot = path.resolve(requireString(root, 'root'));
  const results = [];

  for (const file of [...files].sort(compareCodePoints)) {
    let result;
    try {
      result = spawn(executable, ['--check', file], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        killSignal: 'SIGTERM',
        timeout: timeoutMs,
        windowsHide: true,
      });
    } catch (error) {
      results.push(failedCheck(file, 'spawn', errorDetail(error)));
      continue;
    }

    const output = `${stringOutput(result?.stderr)}${stringOutput(result?.stdout)}`;
    if (result?.error) {
      const detail = result.error.code === 'ETIMEDOUT'
        ? `timed out after ${timeoutMs} ms`
        : errorDetail(result.error);
      results.push(failedCheck(file, 'spawn', detail, output));
      continue;
    }
    if (result?.status === 0) {
      results.push({ file, ok: true, output: '' });
      continue;
    }
    if (result?.signal) {
      results.push(failedCheck(file, 'signal', `terminated by ${result.signal}`, output));
      continue;
    }
    if (result?.status === null || result?.status === undefined) {
      results.push(failedCheck(file, 'status', 'node --check returned no exit status', output));
      continue;
    }
    results.push(failedCheck(file, 'syntax', `node --check exited with status ${result.status}`, output));
  }

  return results;
}

export function runJavaScriptSyntaxCheck(options = {}) {
  const discovery = collectJavaScriptFiles(options);
  const results = checkJavaScriptFiles({ ...options, files: discovery.files });
  const failedChecks = results.filter((result) => !result.ok);
  return {
    diagnostics: discovery.diagnostics,
    failed: discovery.diagnostics.length + failedChecks.length,
    files: discovery.files,
    passed: results.length - failedChecks.length,
    results,
  };
}

export function formatSyntaxDiagnostic(diagnostic) {
  const operation = diagnostic.operation ? `${diagnostic.operation}: ` : '';
  return `[FAIL] discovery: ${diagnostic.path} - ${operation}${diagnostic.detail}`;
}

function failedCheck(file, operation, detail, output = '') {
  return { detail, file, ok: false, operation, output };
}

function normalizeRelative(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

function isWithinRepository(candidate, repositoryRoot) {
  const relative = path.relative(repositoryRoot, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function errorDetail(error) {
  if (!error) return 'unknown error';
  const code = typeof error.code === 'string' ? `${error.code}: ` : '';
  const message = typeof error.message === 'string' && error.message ? error.message : String(error);
  return `${code}${message}`;
}

function stringOutput(value) {
  if (value === undefined || value === null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
