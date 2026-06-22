'use strict';
/**
 * Looks up the real owner of a file in audit/subsystem_ownership_map.json
 * (basename match against allowedFiles/sharedFiles — that map's own schema,
 * confirmed throughout P29-P31). v1 scope: engines/*.js only (scanRoots);
 * cross-referencing architecture/ownership-map.json's different rule.path
 * schema for tools/ is explicitly deferred, not faked here.
 */
export function collectOwner(filePath, ownershipMap) {
  const baseName = filePath.split('/').pop();

  for (const ss of ownershipMap.subsystems || []) {
    if ((ss.allowedFiles || []).includes(baseName)) return ss.owner;
  }
  if ((ownershipMap.sharedFiles || []).includes(baseName)) return 'shared';
  return 'unowned';
}
