'use strict';
import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENG_DIR = join(ROOT, 'engines');

export function collectEngineExistErrors(subsystems) {
  const errors = [];
  const diskFiles = new Set();

  for (const entry of readdirSync(ENG_DIR, { withFileTypes: true })) {
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.js') {
      diskFiles.add(entry.name);
    }
  }

  for (const ss of subsystems) {
    for (const f of (ss.allowedFiles || [])) {
      if (!diskFiles.has(f)) {
        errors.push({ rule: 'RULE-EXIST', subsystem: ss.id, file: f, detail: `engines/${f} does not exist on disk` });
      }
    }
  }

  return { errors, diskFiles };
}
