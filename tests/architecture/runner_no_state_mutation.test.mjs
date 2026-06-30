'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGuards } from '../../tools/runners/run_guards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAP_PATH = path.join(ROOT, 'tools/guards/maps/guards-map.json');

test('runGuards — does not mutate guards-map.json', async () => {
  const before = fs.readFileSync(MAP_PATH, 'utf8');
  await runGuards({ mode: 'modular' });
  const after = fs.readFileSync(MAP_PATH, 'utf8');
  assert.equal(before, after, 'guards-map.json must not be modified by runner');
});

test('runGuards — does not create unexpected files in root', async () => {
  const rootFiles = new Set(fs.readdirSync(ROOT));
  await runGuards({ mode: 'modular' });
  const rootFilesAfter = fs.readdirSync(ROOT);
  const added = rootFilesAfter.filter(f => !rootFiles.has(f));
  assert.deepEqual(added, [], `unexpected root files created: ${added.join(', ')}`);
});
