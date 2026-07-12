import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBfsCandidates } from '../../../tools/e2r-v2/resolvers/resolve_bfs_candidates.mjs';

test('bfs seeds resolve at distance zero', () => {
  const out = resolveBfsCandidates([], [{ path: 'A' }], 2);
  assert.equal(out[0].distance, 0);
});
