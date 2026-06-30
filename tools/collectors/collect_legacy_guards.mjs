'use strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Collect legacy guards: audit/*_guard.mjs files on disk.
 * Returns minimal descriptors compatible with the executor interface.
 */
export function collectLegacyGuards(root) {
  const auditDir = path.join(root, 'audit');
  if (!fs.existsSync(auditDir)) return [];
  return fs.readdirSync(auditDir)
    .filter(f => f.endsWith('_guard.mjs'))
    .sort()
    .map(f => ({
      id: f.replace(/\.mjs$/, '').replace(/_/g, '-'),
      pathCurrent: `audit/${f}`,
      layer: 'guard',
      owner: 'rf-architecture',
    }));
}
