#!/usr/bin/env node
/**
 * audit/ssot_guard.mjs — SSOT compliance gate (orchestrator)
 *
 * Runs subsystem_ssot_guard.mjs, configurational_ssot_guard.mjs, and (P29B)
 * ssot_runtime_binding_guard.mjs in parallel. Exits 0 only when ALL guards
 * pass — closing the gap where running any subset alone left the others
 * silently unverified.
 *
 * Exit codes:
 *   0 = all SSOT guards PASS
 *   1 = one or more SSOT violations or guard crash
 *
 * Usage:
 *   node audit/ssot_guard.mjs
 */

import { spawn }          from 'node:child_process';
import { fileURLToPath }  from 'node:url';
import path               from 'node:path';

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
const SEP   = '─'.repeat(64);

function runGuard(script) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(AUDIT, script)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close',       (code)  => resolve({ script, code: code ?? 1, out }));
    child.on('error',       (err)   => resolve({ script, code: 1, out: `LAUNCH ERROR: ${err.message}\n` }));
  });
}

const GUARDS = [
  'subsystem_ssot_guard.mjs',
  'configurational_ssot_guard.mjs',
  'ssot_runtime_binding_guard.mjs',
];

console.log(`\n${SEP}`);
console.log('🛡  SSOT Guard  ·  Subsystem + Configurational + Runtime Binding');
console.log(SEP);

const results = await Promise.all(GUARDS.map(runGuard));

let failed = 0;
for (const { script, code, out } of results) {
  const sym = code === 0 ? '✅' : '❌';
  console.log(`\n${sym}  ${script}  (exit ${code})`);
  out.trimEnd().split('\n').forEach(l => console.log(`   ${l}`));
  if (code !== 0) failed++;
}

console.log(`\n${SEP}`);
if (failed === 0) {
  console.log('✅  PASS — All SSOT invariants satisfied.');
} else {
  console.log(`❌  FAIL — ${failed} guard(s) failed. Fix SSOT violations before merging.`);
}
console.log(`${SEP}\n`);
process.exit(failed > 0 ? 1 : 0);
