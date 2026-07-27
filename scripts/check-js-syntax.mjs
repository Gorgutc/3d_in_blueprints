import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatSyntaxDiagnostic,
  runJavaScriptSyntaxCheck,
} from './lib/js-syntax-checker.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const outcome = runJavaScriptSyntaxCheck({ root });
for (const diagnostic of outcome.diagnostics) {
  console.error(formatSyntaxDiagnostic(diagnostic));
}
for (const result of outcome.results) {
  if (result.ok) {
    console.log(`[PASS] syntax: ${result.file}`);
    continue;
  }
  console.error(`[FAIL] syntax: ${result.file} - ${result.operation}: ${result.detail}`);
  if (result.output) process.stderr.write(result.output.endsWith('\n') ? result.output : `${result.output}\n`);
}

console.log(`SUMMARY: ${outcome.passed}/${outcome.files.length} PASS, ${outcome.failed} FAIL`);
process.exitCode = outcome.failed === 0 ? 0 : 1;
