import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main as installNativeHooksMain } from './lib/native-hook-installer.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDir, '..');

export function main(options = {}) {
  return installNativeHooksMain({
    ...options,
    root: options.root === undefined ? repositoryRoot : options.root,
  });
}

function errorDetail(error) {
  if (!error) return 'unknown error';
  const code = typeof error.code === 'string' ? `${error.code}: ` : '';
  const message = typeof error.message === 'string' && error.message ? error.message : String(error);
  return `${code}${message}`;
}

function comparablePath(candidate) {
  let value = path.resolve(candidate);
  if (process.platform === 'win32') value = value.toLowerCase();
  return value;
}

function isDirectRun(argvPath = process.argv[1]) {
  return typeof argvPath === 'string'
    && argvPath.length > 0
    && comparablePath(argvPath) === comparablePath(scriptPath);
}

if (isDirectRun()) {
  try {
    main();
  } catch (error) {
    console.error(`Cannot install Git hooks: ${errorDetail(error)}`);
    process.exitCode = 1;
  }
}
