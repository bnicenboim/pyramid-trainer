// Runs every test file in this folder, one after another, and reports which ones failed
// (a test fails when it exits non-zero or prints a non-empty `errors: [...]`).
import { spawnSync } from 'child_process'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = fs.readdirSync(here).filter(f => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run-all.mjs' && (!only.length || only.some(o => f.includes(o)))).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(here, f)], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = r.status !== 0 || /errors: \[\s*[^\]\s]/.test(out.replace(/errors: \[\s*'Failed to load resource[^\]]*\]/g, 'errors: []'));
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${f}`);
  if (bad) { failed++; console.log(out.split('\n').slice(-15).join('\n')); }
}
console.log(failed ? `\n${failed} of ${files.length} failed` : `\nall ${files.length} passed`);
process.exit(failed ? 1 : 0);
