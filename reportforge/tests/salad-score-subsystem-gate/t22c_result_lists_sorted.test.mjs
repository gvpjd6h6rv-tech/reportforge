import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResultListsSorted } from '../../../tools/salad-score/subsystem-gate/contracts/check_result_lists_sorted.mjs';

test('T22C: every list-valued field must be in deterministic sorted order', () => {
  assert.equal(checkResultListsSorted({ ALL_OWNED_FILES: ['a.mjs', 'b.mjs'] }).value, true);
  assert.equal(checkResultListsSorted({ ALL_OWNED_FILES: ['b.mjs', 'a.mjs'] }).value, false);
});
