import path from 'node:path';

export const ROUTE_NONE = Object.freeze([]);
export const ROUTE_DEEP = Object.freeze(['quality:deep']);
export const ROUTE_BLENDER = Object.freeze(['quality:deep', 'test:blender:if-available']);

const ROOT_FILES = new Set([
  '.gitignore',
  'AGENTS.md',
  'CLAUDE.md',
  'DO_NOT_PUSH.md',
  'GEMINI.md',
  'README.md',
  'lefthook.yml',
  'package-lock.json',
  'package.json',
]);
const GOVERNED_PREFIXES = [
  '.agents/',
  '.codex/',
  '.github/workflows/',
  'backend/',
  'blender_addon/',
  'docs/agent/',
  'docs/handoff/',
  'docs/release/',
  'plugins/blueprints-codex/',
  'scripts/',
];
const BLENDER_PREFIXES = [
  'backend/src/blueprints_backend/',
  'blender_addon/blueprints_addon/',
];
const BLENDER_FILES = new Set([
  'blender_addon/tests/smoke_blender_bridge.py',
  'blender_addon/tests/smoke_blender_packaged.py',
  'scripts/package_release.py',
  'scripts/lib/python-resolver.mjs',
  'scripts/run-blender-smoke.mjs',
]);
const PATH_KEYS = new Set(['file_path', 'path']);
const PATH_LIST_KEYS = new Set(['file_paths', 'files', 'paths']);
const PATCH_KEYS = new Set(['input', 'patch']);
const CONTENT_EDIT_KEYS = new Set(['new_string', 'old_string', 'replace_all']);

export class HookPayloadError extends Error {
  constructor(message, code = 'invalid_hook_payload') {
    super(message);
    this.code = code;
    this.name = 'HookPayloadError';
  }
}

export function planPostToolVerification(rawInput, { platform = process.platform, root } = {}) {
  const payload = parsePayload(rawInput);
  const candidates = extractChangedPathCandidates(payload);
  if (candidates.length === 0) {
    throw new HookPayloadError('no changed file path was found in the supported payload fields');
  }
  const paths = [...new Set(candidates.map((candidate) => normalizeChangedPath(candidate, root, { platform })))].sort();
  return { commands: classifyChangedPaths(paths, { platform }), paths };
}

export function parsePayload(rawInput) {
  if (typeof rawInput !== 'string' || rawInput.trim() === '') {
    throw new HookPayloadError('payload must be non-empty JSON');
  }
  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch (error) {
    throw new HookPayloadError(`payload is not valid JSON: ${error.message}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HookPayloadError('payload must be a JSON object');
  }
  return payload;
}

export function extractChangedPathCandidates(payload) {
  const candidates = [];
  const input = Object.hasOwn(payload, 'tool_input') ? payload.tool_input : payload;
  if (typeof input === 'string') return extractPatchPaths(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HookPayloadError('tool_input must be an object or apply_patch text');
  }
  collectStructuredPaths(input, candidates, new Set());
  return candidates;
}

export function normalizeChangedPath(candidate, root, { platform = process.platform } = {}) {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new HookPayloadError('changed file paths must be non-empty strings');
  }
  if (candidate.includes('\0')) throw new HookPayloadError('changed file path contains a NUL byte');
  const repositoryRoot = path.resolve(requireRoot(root));
  const raw = candidate.trim();
  const rootIsWindows = /^[A-Za-z]:[\\/]|^\\\\/.test(repositoryRoot);
  const windowsAbsolute = /^[A-Za-z]:[\\/]|^(?:\\\\|\/\/)/.test(raw)
    || (rootIsWindows && /^\\/.test(raw));
  const posixAbsolute = /^\/(?!\/)/.test(raw);
  if (/^[A-Za-z]:(?![\\/])/.test(raw)) {
    throw new HookPayloadError(`drive-relative changed file path is not allowed: ${raw}`, 'unsafe_hook_path');
  }

  let relative;
  let separator;
  let relativeIsAbsolute;
  if (windowsAbsolute || posixAbsolute) {
    if (windowsAbsolute !== rootIsWindows) {
      throw new HookPayloadError(`changed file path uses a foreign absolute path style: ${raw}`, 'unsafe_hook_path');
    }
    const pathApi = windowsAbsolute ? path.win32 : path.posix;
    relative = pathApi.relative(pathApi.resolve(repositoryRoot), pathApi.resolve(raw));
    separator = pathApi.sep;
    relativeIsAbsolute = pathApi.isAbsolute(relative);
  } else {
    const portableRelative = raw.replaceAll('\\', '/');
    const absolute = path.resolve(repositoryRoot, portableRelative);
    relative = path.relative(repositoryRoot, absolute);
    separator = path.sep;
    relativeIsAbsolute = path.isAbsolute(relative);
  }
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${separator}`)
    || relativeIsAbsolute
  ) {
    throw new HookPayloadError(`changed file path is outside the repository: ${raw}`, 'unsafe_hook_path');
  }
  let normalized = relative.replaceAll('\\', '/');
  if (platform === 'win32') {
    const components = normalized.split('/').map((component) => component.replace(/[ .]+$/g, ''));
    if (components.some((component) => component === '' || component === '.' || component === '..')) {
      throw new HookPayloadError(`changed file path has an unsafe Windows component: ${raw}`, 'unsafe_hook_path');
    }
    for (const component of components) {
      const deviceBase = component.split('.')[0].toUpperCase();
      if (component.includes(':')) {
        throw new HookPayloadError(`NTFS alternate data streams are not allowed: ${raw}`, 'unsafe_hook_path');
      }
      if (/~\d+(?:\.|$)/i.test(component)) {
        throw new HookPayloadError(`Windows short-name aliases are not allowed: ${raw}`, 'unsafe_hook_path');
      }
      if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceBase)) {
        throw new HookPayloadError(`Windows device-name components are not allowed: ${raw}`, 'unsafe_hook_path');
      }
    }
    normalized = components.join('/');
  }
  return normalized;
}

export function classifyChangedPaths(paths, { platform = process.platform } = {}) {
  const caseInsensitive = platform === 'win32';
  const governed = paths.some((rel) => isGovernedPath(rel, caseInsensitive));
  if (!governed) return [...ROUTE_NONE];
  return paths.some((rel) => isBlenderSensitivePath(rel, caseInsensitive)) ? [...ROUTE_BLENDER] : [...ROUTE_DEEP];
}

export function executeVerificationPlan(commands, runCommand) {
  for (const command of commands) {
    let result;
    try {
      result = runCommand(command);
    } catch (error) {
      return {
        failedCommand: command,
        ok: false,
        result: { detail: error instanceof Error ? error.message : String(error) },
      };
    }
    if (!result || result.ok !== true) {
      return {
        failedCommand: command,
        ok: false,
        result: result || { detail: 'command runner returned no result' },
      };
    }
  }
  return { ok: true };
}

function collectStructuredPaths(value, candidates, seen) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HookPayloadError('structured edit entries must be objects');
  }
  if (seen.has(value)) return;
  seen.add(value);
  const hasDirectPathContext = [...PATH_KEYS].some((key) => (
    Object.hasOwn(value, key) && typeof value[key] === 'string' && value[key].trim() !== ''
  ));

  for (const [key, entry] of Object.entries(value)) {
    if (PATH_KEYS.has(key)) {
      if (typeof entry !== 'string') throw new HookPayloadError(`${key} must be a string`);
      candidates.push(entry);
      continue;
    }
    if (PATH_LIST_KEYS.has(key)) {
      if (!Array.isArray(entry)) throw new HookPayloadError(`${key} must be an array`);
      for (const item of entry) {
        if (typeof item === 'string') candidates.push(item);
        else if (item && typeof item === 'object' && !Array.isArray(item)) {
          const before = candidates.length;
          collectStructuredPaths(item, candidates, seen);
          if (candidates.length === before) {
            throw new HookPayloadError(`${key} path objects must contain a recognized path or patch field`);
          }
        }
        else throw new HookPayloadError(`${key} entries must be strings or path objects`);
      }
      continue;
    }
    if (key === 'edits') {
      if (!Array.isArray(entry)) throw new HookPayloadError('edits must be an array');
      for (const edit of entry) {
        if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
          throw new HookPayloadError('edits entries must be objects');
        }
        const before = candidates.length;
        collectStructuredPaths(edit, candidates, seen);
        if (candidates.length === before && !(hasDirectPathContext && isContentEditRecord(edit))) {
          throw new HookPayloadError('edits entries must contain a recognized path or patch field');
        }
      }
      continue;
    }
    if (PATCH_KEYS.has(key)) {
      if (typeof entry !== 'string') throw new HookPayloadError(`${key} must be a string`);
      candidates.push(...extractPatchPaths(entry));
    }
  }
}

function isContentEditRecord(value) {
  const keys = Object.keys(value);
  return keys.length >= 2
    && keys.every((key) => CONTENT_EDIT_KEYS.has(key))
    && typeof value.old_string === 'string'
    && typeof value.new_string === 'string'
    && (!Object.hasOwn(value, 'replace_all') || typeof value.replace_all === 'boolean');
}

function extractPatchPaths(source) {
  const paths = [];
  const pattern = /^\*\*\* (?:Add|Delete|Update) File:\s*(.+?)\s*$|^\*\*\* Move to:\s*(.+?)\s*$/gm;
  for (const match of source.matchAll(pattern)) paths.push(match[1] || match[2]);
  return paths;
}

function isGovernedPath(rel, caseInsensitive) {
  const candidate = caseInsensitive ? rel.toLowerCase() : rel;
  return [...ROOT_FILES].some((rootFile) => (caseInsensitive ? rootFile.toLowerCase() : rootFile) === candidate)
    || GOVERNED_PREFIXES.some((prefix) => candidate.startsWith(caseInsensitive ? prefix.toLowerCase() : prefix));
}

function isBlenderSensitivePath(rel, caseInsensitive) {
  const candidate = caseInsensitive ? rel.toLowerCase() : rel;
  return [...BLENDER_FILES].some((file) => (caseInsensitive ? file.toLowerCase() : file) === candidate)
    || BLENDER_PREFIXES.some((prefix) => candidate.startsWith(caseInsensitive ? prefix.toLowerCase() : prefix));
}

function requireRoot(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new HookPayloadError('repository root must be a non-empty string');
  }
  return root;
}
