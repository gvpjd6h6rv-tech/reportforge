'use strict';
import fs from 'node:fs';
import path from 'node:path';
export function joinOwnership(files, ownershipMapPath) {
  const ownershipMap = typeof ownershipMapPath === 'string' ? JSON.parse(fs.readFileSync(path.resolve(ownershipMapPath), 'utf8')) : (ownershipMapPath || {});
  const shared = new Set([...(ownershipMap.sharedFiles || []), ...(ownershipMap.sharedPaths || [])].map((value) => String(value).replace(/\\/g, '/')));
  const rows = [];
  for (const file of files || []) {
    const relative = String(file.relative || file.path || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
    const base = relative.split('/').pop();
    const owners = [];
    for (const subsystem of ownershipMap.subsystems || []) {
      const allowed = new Set((subsystem.allowedFiles || []).map((value) => String(value).replace(/\\/g, '/').replace(/^\.\/+/, '')));
      if (allowed.has(relative) || allowed.has(base)) owners.push(subsystem.owner);
    }
    let ownerState = 'UNOWNED';
    let canonicalOwner = null;
    if (owners.length === 1) {
      ownerState = 'RESOLVED';
      canonicalOwner = owners[0];
    } else if (owners.length > 1) {
      ownerState = 'CONFLICT';
    } else if (shared.has(relative) || shared.has(base)) {
      ownerState = 'SHARED_UNRESOLVED';
    }
    rows.push({ ...file, relative, ownerState, canonicalOwner, owners });
  }
  return { rows, ownershipMap };
}
