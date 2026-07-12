import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInventoryStage } from '../../../tools/e2r-v2/pipeline/build_inventory_stage.mjs';

test('inventory stage returns physical and ownership inventories', () => {
  const result = buildInventoryStage({ root: '.', config: { scanRoots: ['engines'], excludedDirs: [] }, capabilityMap: { schemaVersion: '2.0.0', phaseId: 'E2R-V2-PHASE-1-GEOMETRY-AND-FILE-SCORING', capabilities: [{ files: [] }] }, ownershipMapPath: 'audit/subsystem_ownership_map.json' });
  assert.ok(Array.isArray(result.physical));
  assert.ok(Array.isArray(result.ownership.rows));
});
