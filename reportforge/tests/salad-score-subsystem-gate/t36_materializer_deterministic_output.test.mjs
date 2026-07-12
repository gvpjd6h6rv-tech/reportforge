import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T36: materializing the same descriptor twice produces byte-identical file content each time', async () => {
  let contentA, contentB;
  await withMaterializedFixture({ files: [SCENARIO.ownedCleanA], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] } },
    async (root) => { contentA = fs.readFileSync(root + '/engines/owned_clean_a.mjs', 'utf8'); });
  await withMaterializedFixture({ files: [SCENARIO.ownedCleanA], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] } },
    async (root) => { contentB = fs.readFileSync(root + '/engines/owned_clean_a.mjs', 'utf8'); });
  assert.equal(contentA, contentB);
});
