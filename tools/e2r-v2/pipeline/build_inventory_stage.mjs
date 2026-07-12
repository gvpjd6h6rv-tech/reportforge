'use strict';
import { collectPhysicalScope } from '../collectors/collect_physical_scope.mjs';
import { resolveCanonicalPaths } from '../resolvers/resolve_canonical_paths.mjs';
import { validateCapabilityMap } from '../validators/validate_capability_map.mjs';
import { joinOwnership } from '../resolvers/join_ownership.mjs';
export function buildInventoryStage({ root, config, capabilityMap, ownershipMapPath }) { const physical = collectPhysicalScope(root, config); const canonical = resolveCanonicalPaths(root, physical.map((file) => file.relative)); const capabilityValidation = validateCapabilityMap(capabilityMap, physical.map((file) => file.relative)); const ownership = joinOwnership(physical, ownershipMapPath); return { physical, canonical, capabilityValidation, ownership }; }
