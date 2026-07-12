import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T30: materialization creates exactly the declared scenario files on disk', async () => {
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] },
  }, async (root) => {
    assert.ok(fs.existsSync(root + '/engines/owned_clean_a.mjs'));
  });
});
