'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const REQUIRED_SUITES = [
  'reportforge/tests/debuggability.test.mjs',
  'reportforge/tests/governance_guardrails.test.mjs',
  'reportforge/tests/engine_contracts.test.mjs',
  'reportforge/tests/race_conditions.test.mjs',
];

/** RULE: The four canonical test suite files must exist on disk. */
export function checkSharedCoreSuitesExist(root = ROOT) {
  const missing = REQUIRED_SUITES.filter(s => !fs.existsSync(path.join(root, s)));
  return { value: missing.length === 0, evidence: missing.map(s => `${s}: required suite file not found`) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkSharedCoreSuitesExist();
  console.log(r.value ? '✓ PASS SHARED-SUITES-001' : '✗ FAIL SHARED-SUITES-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
