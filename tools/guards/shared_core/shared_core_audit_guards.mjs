'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIN_GUARDS = 5;

/** RULE: The audit/ directory must contain at least 5 guard .mjs files. */
export function checkSharedCoreAuditGuards(root = ROOT) {
  const auditDir = path.join(root, 'audit');
  const guards = fs.existsSync(auditDir)
    ? fs.readdirSync(auditDir).filter(f => f.endsWith('_guard.mjs'))
    : [];
  const pass = guards.length >= MIN_GUARDS;
  return {
    value: pass,
    evidence: pass ? [] : [`audit/: found ${guards.length} guard file(s), need ≥${MIN_GUARDS}`],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkSharedCoreAuditGuards();
  console.log(r.value ? '✓ PASS SHARED-GUARDS-001' : '✗ FAIL SHARED-GUARDS-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
