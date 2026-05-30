import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const gitPath = path.join(root, '.git');
const ownerMarker = '# managed-by: 3d_in_blueprints-codex-infra';

function resolveGitDir() {
  if (!existsSync(gitPath)) {
    throw new Error('Cannot install hooks: .git was not found at the repository root.');
  }

  const stat = readFileSyncSafe(gitPath);
  if (stat === null) return gitPath;

  const match = /^gitdir:\s*(.+)\s*$/i.exec(stat);
  if (!match) {
    throw new Error('Cannot install hooks: unsupported .git file format.');
  }

  const gitDir = match[1];
  return path.isAbsolute(gitDir) ? gitDir : path.resolve(root, gitDir);
}

function readFileSyncSafe(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'EISDIR') return null;
    throw error;
  }
}

function hookBody(command) {
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

function legacyHookBody(command) {
  return [
    '#!/bin/sh',
    'set -eu',
    'repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"',
    'cd "$repo_root"',
    command,
    '',
  ].join('\n');
}

function normalizeHook(body) {
  return body.replace(/\r\n/g, '\n');
}

const gitDir = resolveGitDir();
const hooksDir = path.join(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });

const hooks = new Map([
  ['pre-commit', 'npm run quality:fast'],
  ['pre-push', 'npm run codex:ship'],
]);

for (const [name, command] of hooks) {
  const target = path.join(hooksDir, name);
  if (existsSync(target)) {
    const existing = normalizeHook(readFileSync(target, 'utf8'));
    const owned = existing.includes(ownerMarker);
    const legacyOwned = existing === legacyHookBody(command);
    if (!owned && !legacyOwned) {
      throw new Error(`Refusing to overwrite unmanaged Git hook: ${target}`);
    }
  }
  writeFileSync(target, hookBody(command), { encoding: 'utf8' });
  chmodSync(target, 0o755);
  console.log(`installed ${name}: ${command}`);
}

console.log('Codex infrastructure git hooks installed.');
