'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CANON = path.join(ROOT, 'docs', 'architecture', 'testing-canon.md');

/** RULE: testing-canon.md must contain a "Shared Core Standards" section
 *  that lists validate_repo.sh as the entry point. */
export function checkSharedCoreDocSection(canonPath = CANON) {
  const evidence = [];
  if (!fs.existsSync(canonPath)) {
    return { value: false, evidence: [`${canonPath}: file not found`] };
  }
  const doc = fs.readFileSync(canonPath, 'utf8');
  if (!/Shared Core Standards/.test(doc))
    evidence.push(`${canonPath}: missing "Shared Core Standards" section`);
  if (!/validate_repo\.sh/.test(doc))
    evidence.push(`${canonPath}: "Shared Core Standards" must reference validate_repo.sh`);
  return { value: evidence.length === 0, evidence };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkSharedCoreDocSection();
  console.log(r.value ? '✓ PASS SHARED-DOC-001' : '✗ FAIL SHARED-DOC-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
