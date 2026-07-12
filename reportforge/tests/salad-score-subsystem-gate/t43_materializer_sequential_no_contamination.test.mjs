import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';

test('T43: two sequential materializations never see each other\'s files (no contamination across runs)', async () => {
  await withMaterializedFixture({ files: [{ relPath: 'only_in_first.mjs', content: 'x' }], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] } },
    async (root) => { assert.ok(fs.existsSync(root + '/only_in_first.mjs')); });
  await withMaterializedFixture({ files: [], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] } },
    async (root) => { assert.equal(fs.existsSync(root + '/only_in_first.mjs'), false); });
});
