'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubNonCode } from '../../audit/architecture/scrub_non_code.mjs';

test('scrubNonCode — leaves for-loop semicolons and parens intact', () => {
  assert.equal(scrubNonCode('for(a;b;c)'), 'for(a;b;c)');
});

test('scrubNonCode — blanks out semicolons inside a double-quoted string', () => {
  assert.doesNotMatch(scrubNonCode('const s = "a;b;c";'), /a;b;c/);
  assert.match(scrubNonCode('const s = "a;b;c";'), /;$/);
});

test('scrubNonCode — blanks out semicolons inside a single-quoted string', () => {
  assert.doesNotMatch(scrubNonCode("const s = 'a;b';"), /a;b/);
});

test('scrubNonCode — blanks out a line comment entirely', () => {
  assert.doesNotMatch(scrubNonCode('// comment; with; semicolons'), /comment/);
});

test('scrubNonCode — blanks out a block comment entirely, preserving line breaks', () => {
  const out = scrubNonCode('/* a;\nb; */\nx();');
  assert.doesNotMatch(out, /a;|b;/);
  assert.equal(out.split('\n').length, 3);
});

test('scrubNonCode — blanks out a template literal including ${} interpolation', () => {
  assert.doesNotMatch(scrubNonCode('const t = `hello ${x}; world`;'), /hello|world/);
});

test('scrubNonCode — treats / as regex after = and blanks its body', () => {
  assert.doesNotMatch(scrubNonCode('const re = /a;b/;'), /a;b/);
});

test('scrubNonCode — treats / as division after an identifier, keeps real semicolons visible', () => {
  const out = scrubNonCode('a / b; c / d;');
  assert.equal((out.match(/;/g) || []).length, 2);
});

test('scrubNonCode — output has the same length and line count as the input', () => {
  const src = 'const s = "a;b";\nfor(a;b;c){ x(); }\n// note;\n';
  const out = scrubNonCode(src);
  assert.equal(out.length, src.length);
  assert.equal(out.split('\n').length, src.split('\n').length);
});
