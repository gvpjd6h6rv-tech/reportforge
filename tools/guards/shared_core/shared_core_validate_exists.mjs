'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** RULE: validate_repo.sh must exist at the repository root. */
export function checkSharedCoreValidateExists(root = ROOT) {
  const target = path.join(root, 'validate_repo.sh');
  const pass = fs.existsSync(target);
  return { value: pass, evidence: pass ? [] : [`validate_repo.sh: not found at ${target}`] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkSharedCoreValidateExists();
  console.log(r.value ? '✓ PASS SHARED-VALIDATE-001' : '✗ FAIL SHARED-VALIDATE-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
