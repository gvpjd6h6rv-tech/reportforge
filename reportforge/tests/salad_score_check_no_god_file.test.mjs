'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoGodFile } from '../../tools/salad-score/checkers/check_no_god_file.mjs';

test('checkNoGodFile — passes when LOC is within cap', () => {
  assert.equal(checkNoGodFile('f.mjs', 'a\nb', 10).value, true);
});

test('checkNoGodFile — fails when LOC exceeds cap', () => {
  const text = Array.from({ length: 5 }, () => 'x').join('\n');
  const r = checkNoGodFile('f.mjs', text, 3);
  assert.equal(r.value, false);
  assert.match(r.evidence[0], /> cap 3/);
});
