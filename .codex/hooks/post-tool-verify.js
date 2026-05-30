import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = JSON.parse(input || '{}');
  } catch {
    payload = {};
  }

  const source = normalizePayload(JSON.stringify(payload));
  const infraChanged = [
    /AGENTS\.md/,
    /CLAUDE\.md/,
    /GEMINI\.md/,
    /DO_NOT_PUSH\.md/,
    /\.codex\//,
    /\.agents\//,
    /plugins\/blueprints-codex\//,
    /docs\/agent\//,
    /scripts\/.*\.(?:js|mjs|cjs)/,
    /package(?:-lock)?\.json/,
    /lefthook\.yml/,
    /\.github\/workflows\/codex-infra\.yml/
  ].some((pattern) => pattern.test(source));

  if (!infraChanged) return;

  if (process.env.CODEX_INFRA_POST_TOOL_DRY_RUN === '1') {
    process.stdout.write('Codex infrastructure verification would run.\n');
    return;
  }

  const result = runVerify();
  if (result.status !== 0) {
    process.stderr.write('Codex infrastructure verification failed after an infrastructure edit.\n');
    process.exit(2);
  }
});

function normalizePayload(source) {
  return source.replace(/\\+/g, '/');
}

function runVerify() {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd run verify'], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true
    });
  }

  return spawnSync('npm', ['run', 'verify'], {
    cwd: root,
    stdio: 'inherit'
  });
}
