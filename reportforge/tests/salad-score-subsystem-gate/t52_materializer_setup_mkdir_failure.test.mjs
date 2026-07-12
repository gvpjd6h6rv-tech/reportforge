import test from 'node:test';
import assert from 'node:assert/strict';
import realFs from 'node:fs';
import { withMaterializedFixture } from './fixture_materializer.mjs';

test('T52: a mkdir failure during setup propagates BEFORE the callback ever runs (setup error has top precedence)', async () => {
  let callbackRan = false;
  const faultyFs = { ...realFs, mkdirSync: () => { throw new Error('SIMULATED_MKDIR_FAILURE'); } };
  await assert.rejects(
    () => withMaterializedFixture({ files: [{ relPath: 'x.mjs', content: 'x' }], scopeMap: {}, ownershipMap: {} },
      async () => { callbackRan = true; }, faultyFs),
    /SIMULATED_MKDIR_FAILURE/
  );
  assert.equal(callbackRan, false);
});
