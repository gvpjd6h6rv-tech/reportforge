'use strict';
const fs = await import('node:fs');
const path = await import('node:path');
export const checkMapEntryNonexistentFile = (input) => {
  const files = input?.capabilityMap?.capabilities?.[0]?.files || [];
  const root = input?.root || '.';
  const missing = [];
  const diagnostics = [];
  for (const file of files) {
    const rel = String(file?.path || '').replace(/\\/g, '/');
    rel && !fs.existsSync(path.resolve(root, rel)) && (missing.push(rel), diagnostics.push(Object.fromEntries([['code', 'NONEXISTENT_MAP_ENTRY'], ['path', rel]])));
  }
  return Object.fromEntries([['name', 'check_map_entry_nonexistent_file'], ['value', missing.length === 0], ['evidence', Object.fromEntries([['missing', missing], ['checked', files.length]])], ['diagnostics', diagnostics]]);
};
