import test from 'node:test';
import assert from 'node:assert/strict';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import fs from 'node:fs';

test('T41: when both the callback AND cleanup fail, the ORIGINAL callback error is what propagates (never silently swallowed by the cleanup failure)', async () => {
  let capturedRoot;
  await assert.rejects(
    () => withMaterializedFixture({ files: [], scopeMap: { subsystems: {} }, ownershipMap: { subsystems: [] } },
      async (root) => {
        capturedRoot = root;
        fs.rmSync(root, { recursive: true, force: true }); // sabotage: root vanishes before cleanup runs
        throw new Error('ORIGINAL_CALLBACK_FAILURE');
      }),
    (err) => {
      assert.equal(err.message, 'ORIGINAL_CALLBACK_FAILURE');
      return true;
    }
  );
});
