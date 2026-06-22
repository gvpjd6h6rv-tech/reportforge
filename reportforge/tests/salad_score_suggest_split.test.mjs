'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestSplit } from '../../tools/salad-score/scoring/suggest_split.mjs';

test('suggestSplit — maps known responsibility categories to suggestions', () => {
  const r = suggestSplit(['io', 'dom-mutation']);
  assert.equal(r.length, 2);
});

test('suggestSplit — empty input produces no suggestions', () => {
  assert.deepEqual(suggestSplit([]), []);
});
