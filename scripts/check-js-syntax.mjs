import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const roots = ['scripts', '.codex/hooks'];
const files = [];

function collect(rel) {
  const absolute = path.join(root, rel);
  try {
    const stat = statSync(absolute);
    if (stat.isFile() && /\.(?:js|mjs|cjs)$/.test(rel)) files.push(rel);
    if (stat.isDirectory()) {
      const entries = readdirSync(absolute).sort((a, b) => a.localeCompare(b));
      for (const entry of entries) {
        collect(path.join(rel, entry).replaceAll('\\', '/'));
      }
    }
  } catch {
    // Missing hook directories are reported by verify-codex-infra.
  }
}

for (const rel of roots) collect(rel);
files.sort((a, b) => a.localeCompare(b));

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`[PASS] syntax: ${file}`);
  } else {
    failed += 1;
    console.error(`[FAIL] syntax: ${file}`);
    process.stderr.write(result.stderr || result.stdout);
  }
}

console.log(`SUMMARY: ${files.length - failed}/${files.length} PASS, ${failed} FAIL`);
process.exitCode = failed === 0 ? 0 : 1;
