import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T31: the temp root is fully removed after the callback returns (no residue)', async () => {
  let capturedRoot;
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] },
  }, async (root) => { capturedRoot = root; });
  assert.equal(fs.existsSync(capturedRoot), false);
});
