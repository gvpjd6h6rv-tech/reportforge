import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T19: the ownership map schema has no key that answers "which files belong to subsystem X"', async () => {
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA],
    scopeMap: { subsystems: { 'SS-VALID': { files: ['engines/owned_clean_a.mjs'], allOwnedFiles: ['engines/owned_clean_a.mjs'], allowedOwners: ['owner-x'] } } },
    ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] },
  }, async (root) => {
    const ownershipMap = JSON.parse(fs.readFileSync(root + '/audit/subsystem_ownership_map.json', 'utf8'));
    assert.ok(Array.isArray(ownershipMap.subsystems), 'ownership map is keyed by OWNER, not by subsystem ID');
    for (const entry of ownershipMap.subsystems) {
      assert.ok('owner' in entry && 'allowedFiles' in entry);
      assert.ok(!('subsystemId' in entry), 'ownership entries carry no subsystem identity at all');
    }
  });
});
