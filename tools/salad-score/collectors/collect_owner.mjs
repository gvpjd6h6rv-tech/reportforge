'use strict';
/**
 * Looks up the real owner of a file in audit/subsystem_ownership_map.json.
 */

import { buildOwnershipIndex } from '../ownership/ownership_index.mjs';
import { resolveOwnerFromIndex } from '../ownership/ownership_resolver.mjs';

export function collectOwner(filePath, ownershipMap, root = null) {
  const index = buildOwnershipIndex(ownershipMap);
  if (index.errors.length > 0) {
    throw new Error(index.errors[0].detail);
  }
  return resolveOwnerFromIndex(filePath, index, root);
}
