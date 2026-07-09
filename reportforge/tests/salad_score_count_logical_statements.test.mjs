'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { countLogicalStatements } from '../../audit/architecture/count_logical_statements.mjs';

test('contract: for(a;b;c) does not count as 3 external statements', () => {
  // The for-loop's own header semicolons never contribute regardless of
  // how many there are — only the block opener (+2) and the one real
  // statement inside (x();) do. A hypothetical "for(a;b;c;d;e){ x(); }"
  // with a mangled 5-part header would score identically, proving the
  // header itself is never counted.
  const normal = countLogicalStatements('for(a;b;c){ x(); }');
  const mangledHeader = countLogicalStatements('for(a;b;c;d;e){ x(); }');
  assert.equal(normal, mangledHeader);
  assert.equal(normal, 3);
});

test('contract: fusing statements onto one physical line does not reduce the logical count', () => {
  const multiline = 'a();\nb();\nc();\nd();\ne();';
  const oneLine = 'a(); b(); c(); d(); e();';
  assert.equal(countLogicalStatements(oneLine), countLogicalStatements(multiline));
  assert.equal(countLogicalStatements(oneLine), 5);
});

test('contract: a semicolon inside a string/comment/template never produces a false positive', () => {
  assert.equal(countLogicalStatements('const s = "a;b;c";'), 1);
  assert.equal(countLogicalStatements('// a; b; c;\nx();'), 1);
  assert.equal(countLogicalStatements('const t = `a;b;${c}`;'), 1);
});

test('same logical statements, different physical formatting, produce equal counts', () => {
  const compact = 'const a=1;const b=2;const c=3;';
  const spread = 'const a = 1;\nconst b = 2;\nconst c = 3;';
  assert.equal(countLogicalStatements(compact), countLogicalStatements(spread));
});

test('a trivial single-expression facade method is not penalized just for being a block (real precedent: engines/SelectionEngine.js)', () => {
  // method() { return Other.method(this, ...args); } is one real
  // statement, legitimately one physical line — must not score as if it
  // had a multi-statement block squeezed onto one line.
  assert.equal(countLogicalStatements('method() { return Other.method(this, args); }'), 1);
});

test('a control block (for/if/while) always counts its open+close, even wrapping a single statement', () => {
  // Unlike a function block, control flow is conventionally always
  // multi-line regardless of how many statements it wraps.
  assert.equal(countLogicalStatements('if (x) { y(); }'), 3);
  assert.equal(countLogicalStatements('while (x) { y(); }'), 3);
});

test('an object/array literal brace never counts as a block, regardless of property count', () => {
  assert.equal(countLogicalStatements("{name: 'x', type: 'y', default: null}"), 0);
});
