import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnershipIndex } from '../../../tools/salad-score/ownership/ownership_index.mjs';

test('T128: duplicate and ambiguous ownership claims produce explicit index errors', () => {
  const duplicate = buildOwnershipIndex({
    subsystems: [
      { owner: 'owner-a', allowedPaths: ['reportforge/tests/duplicate.mjs'] },
      { owner: 'owner-a', allowedPaths: ['reportforge/tests/duplicate.mjs'] },
    ],
  });
  assert.equal(duplicate.errors[0].rule, 'RULE-DUPLICATE-CLAIM');

  const ambiguous = buildOwnershipIndex({
    subsystems: [
      { owner: 'owner-a', allowedPaths: ['reportforge/tests/ambiguous.mjs'] },
      { owner: 'owner-b', allowedPaths: ['reportforge/tests/ambiguous.mjs'] },
    ],
  });
  assert.equal(ambiguous.errors[0].rule, 'RULE-AMBIGUOUS-CLAIM');
});
