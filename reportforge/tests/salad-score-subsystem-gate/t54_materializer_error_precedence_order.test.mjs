import test from 'node:test';
import assert from 'node:assert/strict';
import { withMaterializedFixture } from './fixture_materializer.mjs';

test('T54: precedence order is setup > callback > cleanup -- a successful setup with a failing callback surfaces the CALLBACK error, not a generic one', async () => {
  await assert.rejects(
    () => withMaterializedFixture({ files: [], scopeMap: {}, ownershipMap: {} }, async () => { throw new Error('CALLBACK_LEVEL_FAILURE'); }),
    /CALLBACK_LEVEL_FAILURE/
  );
});
