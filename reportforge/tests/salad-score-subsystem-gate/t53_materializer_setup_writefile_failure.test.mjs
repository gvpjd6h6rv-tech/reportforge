import test from 'node:test';
import assert from 'node:assert/strict';
import realFs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';

test('T53: a writeFile failure during setup (e.g. writing the scope map) propagates before the callback runs', async () => {
  let callbackRan = false;
  const faultyFs = { ...realFs, writeFileSync: () => { throw new Error('SIMULATED_WRITE_FAILURE'); } };
  await assert.rejects(
    () => withMaterializedFixture({ files: [], scopeMap: {}, ownershipMap: {} },
      async () => { callbackRan = true; }, faultyFs),
    /SIMULATED_WRITE_FAILURE/
  );
  assert.equal(callbackRan, false);
});
