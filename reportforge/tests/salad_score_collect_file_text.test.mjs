'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFileText } from '../../tools/salad-score/collectors/collect_file_text.mjs';

test('collectFileText — reads a real file as utf8 text', () => {
  const tmp = path.join(os.tmpdir(), `salad-score-${Date.now()}.txt`);
  fs.writeFileSync(tmp, 'hola\nmundo');
  assert.equal(collectFileText(tmp), 'hola\nmundo');
  fs.unlinkSync(tmp);
});
