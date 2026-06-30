'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MAP_DEF = path.join(ROOT, 'audit', 'subsystem_ownership_map.json');
const ENG_DEF = path.join(ROOT, 'engines');

/** RULE: Every allowedFile declared in the ownership map must exist on disk under engines/. */
export function checkOwnershipFilesExist(mapPath = MAP_DEF, enginesDir = ENG_DEF) {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const subsystems = map.subsystems ?? [];
  const diskFiles  = new Set(fs.readdirSync(enginesDir).filter(f => f.endsWith('.js')));
  const evidence   = [];
  for (const ss of subsystems) {
    for (const f of (ss.allowedFiles ?? [])) {
      if (!diskFiles.has(f))
        evidence.push(`audit/subsystem_ownership_map.json: ${ss.id} — engines/${f} does not exist on disk`);
    }
  }
  return { value: evidence.length === 0, evidence };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkOwnershipFilesExist();
  console.log(r.value ? '✓ PASS RULE-EXIST' : '✗ FAIL RULE-EXIST');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
