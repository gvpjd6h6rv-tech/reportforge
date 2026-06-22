'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReasons } from '../../tools/salad-score/scoring/build_reasons.mjs';

test('buildReasons — keeps only failing entries, in {rule,message,evidence} shape', () => {
  const entries = [
    { rule: 'a', pass: true, message: 'ok', evidence: [] },
    { rule: 'b', pass: false, message: 'bad', evidence: ['x'] },
  ];
  const reasons = buildReasons(entries);
  assert.equal(reasons.length, 1);
  assert.deepEqual(reasons[0], { rule: 'b', message: 'bad', evidence: ['x'] });
});
