import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJavaScriptFile } from '../../../tools/e2r-v2/ast/parse_javascript_file.mjs';

test('parser falls back from module to script', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2r-v2-ast-'));
  const file = path.join(dir, 'sample.js');
  fs.writeFileSync(file, 'function x(){}', 'utf8');
  const parsed = parseJavaScriptFile(file);
  assert.equal(parsed.sourceType, 'script');
});
