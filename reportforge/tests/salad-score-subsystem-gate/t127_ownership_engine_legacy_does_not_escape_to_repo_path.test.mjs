import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnershipIndex } from '../../../tools/salad-score/ownership/ownership_index.mjs';
import { resolveOwnerFromIndex } from '../../../tools/salad-score/ownership/ownership_resolver.mjs';

test('T127: legacy engine claims stay under engines while repo-relative claims resolve exactly', () => {
  const ownershipMap = {
    subsystems: [{
      owner: 'owner-a',
      allowedFiles: ['Shared.mjs'],
      allowedPaths: ['reportforge/tests/Shared.mjs'],
    }],
  };
  const index = buildOwnershipIndex(ownershipMap);
  assert.equal(resolveOwnerFromIndex('/repo/reportforge/tests/Shared.mjs', index, '/repo'), 'owner-a');
  assert.equal(resolveOwnerFromIndex('/repo/reportforge/other/Shared.mjs', index, '/repo'), 'unowned');
  assert.equal(resolveOwnerFromIndex('/repo/engines/Shared.mjs', index, '/repo'), 'owner-a');
});
