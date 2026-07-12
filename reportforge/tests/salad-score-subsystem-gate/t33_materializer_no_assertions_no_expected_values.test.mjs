import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('T33: the materializer module itself contains no assert calls (pure harness lifecycle, no product rules)', () => {
  const text = fs.readFileSync(new URL('./fixture_materializer.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /\bassert\s*\./, 'materializer must stay a pure lifecycle harness, no assertions of its own');
});
