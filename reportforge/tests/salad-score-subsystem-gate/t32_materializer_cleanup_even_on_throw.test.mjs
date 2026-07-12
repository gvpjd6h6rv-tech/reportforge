import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T32: the temp root is removed even when the callback throws (no residue on failure)', async () => {
  let capturedRoot;
  await assert.rejects(() => withMaterializedFixture({
    files: [SCENARIO.ownedCleanA], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] },
  }, async (root) => { capturedRoot = root; throw new Error('deliberate test failure'); }));
  assert.equal(fs.existsSync(capturedRoot), false);
});
