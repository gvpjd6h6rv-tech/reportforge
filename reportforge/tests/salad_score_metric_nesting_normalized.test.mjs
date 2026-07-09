'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricNestingNormalized } from '../../tools/salad-score/metrics/metric_nesting_normalized.mjs';

test('contract: a brace inside a string does not count as nesting', () => {
  assert.equal(metricNestingNormalized('const s = "a { b } c";').value, 0);
});

test('contract: Crystal-style braces inside a template literal do not count as nesting', () => {
  assert.equal(metricNestingNormalized('const t = `{${f}}`;').value, 0);
});

test('contract: a brace inside a comment does not count as nesting', () => {
  assert.equal(metricNestingNormalized('// comment { with brace }').value, 0);
});

test('contract: a real if/for/while/switch/catch/function block counts exactly like the raw metric', () => {
  assert.equal(metricNestingNormalized('if (x) { y(); }').value, 1);
  assert.equal(metricNestingNormalized('function f() { if (a) { b(); } }').value, 2);
});

test('contract: an object literal still counts as nesting (this metric measures brace depth, not control-flow-only)', () => {
  // metricNestingNormalized only removes FALSE braces (string/template/
  // comment text) — it does not redefine what counts as "real" nesting
  // beyond that. A genuine object literal brace in code is still counted,
  // same as the raw metric always did for real object literals.
  assert.equal(metricNestingNormalized('const o = { a: { b: 1 } };').value, 2);
});

test('mixed real code and false-positive braces: only the real ones count', () => {
  const src = 'function f() { const s = "a { b }"; if (x) { y(); } }';
  assert.equal(metricNestingNormalized(src).value, 2);
});
