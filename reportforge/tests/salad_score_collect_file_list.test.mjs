'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFileList } from '../../tools/salad-score/collectors/collect_file_list.mjs';

function makeFixtureDir() {
  const dir = path.join(os.tmpdir(), `salad-score-list-${Date.now()}`);
  fs.mkdirSync(path.join(dir, 'excluded'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.js'), '');
  fs.writeFileSync(path.join(dir, 'b.mjs'), '');
  fs.writeFileSync(path.join(dir, 'c.txt'), '');
  fs.writeFileSync(path.join(dir, 'excluded', 'd.js'), '');
  return dir;
}

test('collectFileList — finds .js/.mjs files recursively, skips non-js and excluded dirs', () => {
  const dir = makeFixtureDir();
  const files = collectFileList(dir, ['excluded']).map((f) => path.basename(f));
  assert.deepEqual(files.sort(), ['a.js', 'b.mjs']);
  fs.rmSync(dir, { recursive: true, force: true });
});
