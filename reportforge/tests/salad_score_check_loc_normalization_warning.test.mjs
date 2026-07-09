'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLocNormalizationWarning } from '../../tools/salad-score/checkers/check_loc_normalization_warning.mjs';

test('no warning when normalized LOC equals raw LOC', () => {
  const result = checkLocNormalizationWarning(50, 50);
  assert.equal(result.value, false);
  assert.deepEqual(result.evidence, []);
});

test('no warning when normalized LOC is lower (never happens by construction, but must not warn either)', () => {
  const result = checkLocNormalizationWarning(50, 40);
  assert.equal(result.value, false);
});

test('warns with raw/normalized/delta evidence when normalized exceeds raw', () => {
  const result = checkLocNormalizationWarning(21, 49);
  assert.equal(result.value, true);
  assert.equal(result.evidence[0], 'raw=21 normalized=49 delta=+28');
});
