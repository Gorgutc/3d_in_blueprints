import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
const ownerMarker = '# managed-by: 3d_in_blueprints-codex-infra';
const gitTimeoutMs = 10_000;

const defaultFs = Object.freeze({
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
});

export const NATIVE_HOOKS = Object.freeze([
  Object.freeze({ name: 'pre-commit', command: 'npm run quality:fast' }),
  Object.freeze({ name: 'pre-push', command: 'npm run codex:ship' }),
]);

export function hookBody(command) {
  return [
    '#!/bin/sh',
    ownerMarker,
    'set -eu',
    'repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"',
    'cd "$repo_root"',
    command,
    '',
  ].join('\n');
}

export function legacyHookBody(command) {
  return [
    '#!/bin/sh',
    'set -eu',
    'repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"',
    'cd "$repo_root"',
    command,
    '',
  ].join('\n');
}

export function resolveActiveHooksDirectory({
  root,
  spawn = spawnSync,
  timeoutMs = gitTimeoutMs,
} = {}) {
  const cwd = path.resolve(requireNonEmptyString(root, 'root'));
  const topLevel = runGitPathLookup({
    args: ['rev-parse', '--show-toplevel'],
    cwd,
    label: 'repository root',
    spawn,
    timeoutMs,
  });
  if (!samePath(topLevel, cwd)) {
    throw new Error(`Refusing to install hooks outside the intended repository root: ${cwd}`);
  }
  const activePath = runGitPathLookup({
    args: ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
    cwd,
    label: 'hooks path',
    spawn,
    timeoutMs,
  });
  const lexicalOutput = runGitPathLookup({
    allowRelative: true,
    args: ['rev-parse', '--git-path', 'hooks'],
    cwd,
    label: 'lexical hooks path',
    spawn,
    timeoutMs,
  });
  const normalizedLexicalOutput = process.platform === 'win32'
    ? lexicalOutput.replace(/^\/([A-Za-z]:[\\/])/, '$1')
    : lexicalOutput;
  const lexicalPath = path.isAbsolute(normalizedLexicalOutput)
    ? path.resolve(normalizedLexicalOutput)
    : path.resolve(cwd, normalizedLexicalOutput);
  if (!samePath(activePath, lexicalPath)) {
    throw new Error(`Refusing Git hooks path through a reparse redirect: ${lexicalPath}`);
  }
  return activePath;
}

function runGitPathLookup({ allowRelative = false, args, cwd, label, spawn, timeoutMs }) {
  let result;
  try {
    result = spawn(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        killSignal: 'SIGTERM',
        timeout: timeoutMs,
        windowsHide: true,
      },
    );
  } catch (error) {
    throw new Error(`Git ${label} lookup could not start: ${errorDetail(error)}`, { cause: error });
  }

  const stdout = stringOutput(result?.stdout);
  const stderr = stringOutput(result?.stderr);
  if (result?.error) {
    const detail = result.error.code === 'ETIMEDOUT'
      ? `timed out after ${timeoutMs} ms`
      : errorDetail(result.error);
    throw new Error(`Git ${label} lookup failed: ${detail}`, { cause: result.error });
  }
  if (result?.signal) {
    throw new Error(`Git ${label} lookup was terminated by ${result.signal}.`);
  }
  if (result?.status === null || result?.status === undefined) {
    throw new Error(`Git ${label} lookup returned no exit status.`);
  }
  if (result.status !== 0) {
    const detail = stderr ? `: ${singleLine(stderr)}` : '';
    throw new Error(`Git ${label} lookup exited with status ${result.status}${detail}.`);
  }
  if (stderr !== '') {
    throw new Error(`Git ${label} lookup wrote unexpected stderr: ${singleLine(stderr)}`);
  }

  const resolvedPath = onePathLine(stdout, label);
  if (!allowRelative && !path.isAbsolute(resolvedPath)) {
    throw new Error(`Git ${label} lookup returned a non-absolute path: ${resolvedPath}`);
  }
  return allowRelative ? resolvedPath : path.resolve(resolvedPath);
}

export function installNativeHooks({
  root,
  hooks = NATIVE_HOOKS,
  fsApi = defaultFs,
  spawn = spawnSync,
  timeoutMs = gitTimeoutMs,
} = {}) {
  const contract = validateHookContract(hooks);
  const hooksDir = resolveActiveHooksDirectory({ root, spawn, timeoutMs });
  const directoryPlan = preflightDirectory(hooksDir, fsApi);
  const plans = contract.map(({ name, command }) => preflightTarget({
    command,
    fsApi,
    target: path.join(hooksDir, name),
  }));
  const createdDirectories = [];

  try {
    for (const directory of directoryPlan.missingDirectories) {
      assertSecureDirectory(path.dirname(directory), fsApi);
      fsApi.mkdirSync(directory);
      createdDirectories.push(directory);
      assertSecureDirectory(directory, fsApi);
    }

    assertSecureDirectory(hooksDir, fsApi);
    for (const plan of plans) assertTargetUnchanged(plan, fsApi);

    for (const [index, plan] of plans.entries()) {
      plan.temporary = availableTemporaryPath(plan.target, 'stage', index, fsApi);
      fsApi.writeFileSync(plan.temporary, plan.body, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o755,
      });
      fsApi.chmodSync(plan.temporary, 0o755);
      assertSecureFile(plan.temporary, fsApi);
      if (fsApi.readFileSync(plan.temporary, 'utf8') !== plan.body) {
        throw new Error(`Staged Git hook read-back differs: ${plan.target}`);
      }
    }

    const confirmedHooksDir = resolveActiveHooksDirectory({ root, spawn, timeoutMs });
    if (!samePath(confirmedHooksDir, hooksDir)) {
      throw new Error('Git hooks path changed after preflight.');
    }

    for (const plan of plans) {
      assertSecureDirectory(hooksDir, fsApi);
      assertTargetUnchanged(plan, fsApi);
      fsApi.renameSync(plan.temporary, plan.target);
      plan.temporary = null;
      plan.applied = true;
      fsApi.chmodSync(plan.target, 0o755);
      plan.appliedMode = assertSecureFile(plan.target, fsApi).mode & 0o777;
    }

    for (const plan of plans) verifyInstalledTarget(plan, fsApi);
    const finalHooksDir = resolveActiveHooksDirectory({ root, spawn, timeoutMs });
    if (!samePath(finalHooksDir, hooksDir)) {
      throw new Error('Git hooks path changed after installation read-back.');
    }
  } catch (error) {
    const rollbackErrors = rollbackInstallation({ createdDirectories, fsApi, plans });
    if (rollbackErrors.length > 0) {
      throw new Error(
        `${errorDetail(error)} Rollback also failed: ${rollbackErrors.join('; ')}`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    hooks: contract.map(({ name, command }) => ({ name, command })),
    hooksDir,
  };
}

export function main({
  root,
  log = console.log,
  ...options
} = {}) {
  const result = installNativeHooks({ ...options, root });
  for (const { name, command } of result.hooks) {
    log(`installed ${name}: ${command}`);
  }
  log(`Codex infrastructure git hooks installed in ${result.hooksDir}.`);
  return result;
}

function normalizeHook(body) {
  return body.replace(/\r\n/g, '\n');
}

function validateHookContract(hooks) {
  const entries = Array.isArray(hooks)
    ? hooks.map((entry) => ({ command: entry?.command, name: entry?.name }))
    : [];
  const expected = NATIVE_HOOKS.map(({ command, name }) => ({ command, name }));
  if (JSON.stringify(entries) !== JSON.stringify(expected)) {
    throw new Error('Native Git hook contract differs from the exact managed hook contract.');
  }
  return expected;
}

function preflightDirectory(hooksDir, fsApi) {
  const missingDirectories = [];
  let candidate = path.resolve(hooksDir);
  while (true) {
    const stat = lstatOrMissing(candidate, fsApi);
    if (stat) {
      assertSecureDirectory(candidate, fsApi, stat);
      break;
    }
    missingDirectories.unshift(candidate);
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new Error(`Git hooks path has no accessible directory ancestor: ${hooksDir}`);
    }
    candidate = parent;
  }
  return { missingDirectories };
}

function preflightTarget({ command, fsApi, target }) {
  const stat = lstatOrMissing(target, fsApi);
  const body = hookBody(command);
  if (!stat) {
    return {
      applied: false,
      appliedMode: null,
      body,
      existed: false,
      originalBody: null,
      originalMode: null,
      target,
      temporary: null,
      verifiedRecovery: false,
    };
  }

  assertSecureFile(target, fsApi, stat);
  const originalBody = fsApi.readFileSync(target);
  const existing = normalizeHook(originalBody.toString('utf8'));
  const owned = existing === body;
  const legacyOwned = existing === legacyHookBody(command);
  if (!owned && !legacyOwned) {
    throw new Error(`Refusing to overwrite unmanaged Git hook: ${target}`);
  }
  return {
    applied: false,
    appliedMode: null,
    body,
    existed: true,
    originalBody,
    originalMode: stat.mode & 0o777,
    target,
    temporary: null,
    verifiedRecovery: false,
  };
}

function assertTargetUnchanged(plan, fsApi) {
  const stat = lstatOrMissing(plan.target, fsApi);
  if (!plan.existed) {
    if (stat) throw new Error(`Git hook appeared after preflight: ${plan.target}`);
    return;
  }
  if (!stat) throw new Error(`Git hook disappeared after preflight: ${plan.target}`);
  assertSecureFile(plan.target, fsApi, stat);
  const current = fsApi.readFileSync(plan.target);
  if (!Buffer.isBuffer(current) || !current.equals(plan.originalBody)) {
    throw new Error(`Git hook changed after preflight: ${plan.target}`);
  }
  if ((stat.mode & 0o777) !== plan.originalMode) {
    throw new Error(`Git hook mode changed after preflight: ${plan.target}`);
  }
}

function verifyInstalledTarget(plan, fsApi) {
  const stat = assertSecureFile(plan.target, fsApi);
  const installed = fsApi.readFileSync(plan.target, 'utf8');
  if (installed !== plan.body) {
    throw new Error(`Installed Git hook read-back differs: ${plan.target}`);
  }
  if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
    throw new Error(`Installed Git hook is not executable: ${plan.target}`);
  }
}

function rollbackInstallation({ createdDirectories, fsApi, plans }) {
  const errors = [];
  for (const plan of [...plans].reverse()) {
    if (!plan.applied) continue;
    try {
      if (plan.existed) {
        const installedStat = assertSecureFile(plan.target, fsApi);
        const installed = fsApi.readFileSync(plan.target, 'utf8');
        if (installed !== plan.body) throw new Error('installed bytes changed before rollback');
        if (plan.appliedMode !== null && (installedStat.mode & 0o777) !== plan.appliedMode) {
          throw new Error('installed mode changed before rollback');
        }
        const rollbackPath = availableTemporaryPath(plan.target, 'rollback', 0, fsApi);
        plan.temporary = rollbackPath;
        fsApi.writeFileSync(rollbackPath, plan.originalBody, {
          flag: 'wx',
          mode: plan.originalMode,
        });
        fsApi.chmodSync(rollbackPath, plan.originalMode);
        const recoveryStat = assertSecureFile(rollbackPath, fsApi);
        const recoveryBody = fsApi.readFileSync(rollbackPath);
        if (!Buffer.isBuffer(recoveryBody) || !recoveryBody.equals(plan.originalBody)) {
          throw new Error('recovery candidate bytes differ');
        }
        if ((recoveryStat.mode & 0o777) !== plan.originalMode) {
          throw new Error('recovery candidate mode differs');
        }
        plan.verifiedRecovery = true;
        fsApi.renameSync(rollbackPath, plan.target);
        plan.temporary = null;
        plan.verifiedRecovery = false;
        fsApi.chmodSync(plan.target, plan.originalMode);
        const restoredStat = assertSecureFile(plan.target, fsApi);
        const restored = fsApi.readFileSync(plan.target);
        if (!Buffer.isBuffer(restored) || !restored.equals(plan.originalBody)) {
          throw new Error('restored bytes differ');
        }
        if ((restoredStat.mode & 0o777) !== plan.originalMode) {
          throw new Error('restored mode differs');
        }
      } else {
        const installedStat = assertSecureFile(plan.target, fsApi);
        const installed = fsApi.readFileSync(plan.target, 'utf8');
        if (installed !== plan.body) throw new Error('installed bytes changed before rollback');
        if (plan.appliedMode !== null && (installedStat.mode & 0o777) !== plan.appliedMode) {
          throw new Error('installed mode changed before rollback');
        }
        fsApi.unlinkSync(plan.target);
      }
      plan.applied = false;
      plan.appliedMode = null;
    } catch (error) {
      if (plan.temporary && plan.verifiedRecovery) plan.preserveTemporary = true;
      const recovery = plan.preserveTemporary
        ? `; recovery candidate preserved at ${plan.temporary}`
        : '';
      errors.push(`${plan.target}: ${errorDetail(error)}${recovery}`);
    }
  }

  for (const plan of plans) {
    if (!plan.temporary) continue;
    if (plan.preserveTemporary) continue;
    try {
      const stat = lstatOrMissing(plan.temporary, fsApi);
      if (stat) {
        assertSecureFile(plan.temporary, fsApi, stat);
        fsApi.unlinkSync(plan.temporary);
      }
      plan.temporary = null;
      plan.verifiedRecovery = false;
    } catch (error) {
      errors.push(`${plan.temporary}: ${errorDetail(error)}`);
    }
  }

  for (const directory of [...createdDirectories].reverse()) {
    try {
      fsApi.rmdirSync(directory);
    } catch (error) {
      errors.push(`${directory}: ${errorDetail(error)}`);
    }
  }
  return errors;
}

function availableTemporaryPath(target, purpose, index, fsApi) {
  const directory = path.dirname(target);
  const base = path.basename(target);
  const nonce = `${process.pid}-${Date.now()}-${index}`;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = path.join(directory, `.${base}.codex-${purpose}-${nonce}-${attempt}`);
    if (!lstatOrMissing(candidate, fsApi)) return candidate;
  }
  throw new Error(`Cannot reserve a temporary path for Git hook: ${target}`);
}

function assertSecureDirectory(candidate, fsApi, knownStat = null) {
  const stat = knownStat || fsApi.lstatSync(candidate);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing Git hooks path through a symbolic link or junction: ${candidate}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Git hooks path component is not a directory: ${candidate}`);
  }
  assertRealPath(candidate, fsApi);
  return stat;
}

function assertSecureFile(candidate, fsApi, knownStat = null) {
  const stat = knownStat || fsApi.lstatSync(candidate);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing symbolic-link, junction, or reparse Git hook: ${candidate}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Git hook target is not a regular file: ${candidate}`);
  }
  if (typeof stat.nlink === 'number' && stat.nlink !== 1) {
    throw new Error(`Refusing multiply-linked Git hook target: ${candidate}`);
  }
  assertRealPath(candidate, fsApi);
  return stat;
}

function assertRealPath(candidate, fsApi) {
  const lexical = comparablePath(candidate);
  const resolved = comparablePath(fsApi.realpathSync(candidate));
  if (lexical !== resolved) {
    throw new Error(`Refusing Git hooks path through a reparse redirect: ${candidate}`);
  }
}

function comparablePath(candidate) {
  let value = path.resolve(candidate);
  if (process.platform === 'win32') {
    value = value
      .replace(/^\\\\\?\\UNC\\/i, '\\\\')
      .replace(/^\\\\\?\\/i, '')
      .toLowerCase();
  }
  return value;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function lstatOrMissing(candidate, fsApi) {
  try {
    return fsApi.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function onePathLine(stdout, label) {
  let value = stdout;
  if (value.endsWith('\r\n')) value = value.slice(0, -2);
  else if (value.endsWith('\n')) value = value.slice(0, -1);
  if (value.length === 0) throw new Error(`Git ${label} lookup returned empty stdout.`);
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`Git ${label} lookup returned an ambiguous multi-line path.`);
  }
  return value;
}

function singleLine(value) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function stringOutput(value) {
  if (value === undefined || value === null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function errorDetail(error) {
  if (!error) return 'unknown error';
  const code = typeof error.code === 'string' ? `${error.code}: ` : '';
  const message = typeof error.message === 'string' && error.message ? error.message : String(error);
  return `${code}${message}`;
}

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
