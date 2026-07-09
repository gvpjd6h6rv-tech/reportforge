'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoMinifiedSource } from '../../tools/salad-score/checkers/check_no_minified_source.mjs';

test('contract: a single legitimate long line (e.g. a URL/string) never fails alone', () => {
  const lines = ['const x = 1;', 'const y = 2;', 'const url = "' + 'a'.repeat(250) + '";', 'const z = 3;', 'const w = 4;'];
  const result = checkNoMinifiedSource('f.js', lines.join('\n'));
  assert.equal(result.value, true);
});

test('contract: a high proportion of very-long lines fails with evidence', () => {
  const longLine = 'const a=1;'.repeat(40);
  const lines = Array(10).fill(longLine);
  const result = checkNoMinifiedSource('f.js', lines.join('\n'));
  assert.equal(result.value, false);
  assert.equal(result.evidence.length, 1);
  assert.match(result.evidence[0], /\d+\/\d+ lines/);
});

test('normal, readable multi-line code passes', () => {
  const src = Array(20).fill('const a = 1;').join('\n');
  assert.equal(checkNoMinifiedSource('f.js', src).value, true);
});

test('files with too few lines are never flagged (avoids trivial false positives)', () => {
  const result = checkNoMinifiedSource('f.js', 'a'.repeat(500));
  assert.equal(result.value, true);
});
