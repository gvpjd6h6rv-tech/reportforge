'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCappedLinear } from '../../tools/salad-score/normalizers/normalize_capped_linear.mjs';

test('normalizeCappedLinear — linear scale below the cap', () => {
  assert.equal(normalizeCappedLinear(50, 100), 50);
});

test('normalizeCappedLinear — clamps at 100 above the cap', () => {
  assert.equal(normalizeCappedLinear(150, 100), 100);
});

test('normalizeCappedLinear — returns 0 for an invalid (zero/negative) cap', () => {
  assert.equal(normalizeCappedLinear(50, 0), 0);
  assert.equal(normalizeCappedLinear(50, -5), 0);
});
