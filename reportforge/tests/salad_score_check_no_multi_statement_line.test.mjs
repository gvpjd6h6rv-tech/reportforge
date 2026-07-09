'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoMultiStatementLine } from '../../tools/salad-score/checkers/check_no_multi_statement_line.mjs';

test('contract: a single statement per line passes', () => {
  const result = checkNoMultiStatementLine('f.js', 'a();\nb();\nc();');
  assert.equal(result.value, true);
  assert.deepEqual(result.evidence, []);
});

test('contract: multiple real statements squeezed onto one line fails with evidence', () => {
  const result = checkNoMultiStatementLine('f.js', 'a(); b(); c();');
  assert.equal(result.value, false);
  assert.equal(result.evidence.length, 1);
  assert.match(result.evidence[0], /L1:/);
});

test('contract: for(a;b;c) header semicolons on one line do not trigger a false positive', () => {
  const result = checkNoMultiStatementLine('f.js', 'for (a; b; c) { x(); }');
  assert.equal(result.value, true);
});

test('contract: a semicolon inside a string or comment never triggers a false positive', () => {
  const withString = checkNoMultiStatementLine('f.js', 'const s = "a;b;c";');
  const withComment = checkNoMultiStatementLine('f.js', '// a; b; c;\nx();');
  assert.equal(withString.value, true);
  assert.equal(withComment.value, true);
});
