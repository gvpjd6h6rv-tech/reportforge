import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';

test('every e2r-v2 test file has exactly one entrypoint', () => {
  const dir = path.resolve('reportforge/tests/e2r-v2');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.test.mjs'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const count = (text.match(/\btest\s*\(/g) || []).length;
    assert.equal(count, 1, file);
  }
});
