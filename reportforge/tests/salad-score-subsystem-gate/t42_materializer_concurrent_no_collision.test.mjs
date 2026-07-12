import test from 'node:test';
import assert from 'node:assert/strict';
import { withMaterializedFixture } from './fixture_materializer.mjs';

test('T42: two concurrent materializations never collide (each gets its own unique temp root)', async () => {
  const roots = [];
  await Promise.all([
    withMaterializedFixture({ files: [], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] } }, async (r) => { roots.push(r); }),
    withMaterializedFixture({ files: [], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] } }, async (r) => { roots.push(r); }),
  ]);
  assert.notEqual(roots[0], roots[1]);
});
