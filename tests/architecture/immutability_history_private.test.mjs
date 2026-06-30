'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkHistoryPrivate } from '../../tools/guards/immutability/immutability_history_private.mjs';

function tmpDir(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  for (const [name, src] of Object.entries(files)) fs.writeFileSync(path.join(d, name), src);
  return d;
}

test('checkHistoryPrivate — passes when only HistoryEngine.js contains _undoStack', () => {
  const d = tmpDir({ 'HistoryEngine.js': 'const _undoStack = [];', 'Other.js': 'function noop() {}' });
  assert.equal(checkHistoryPrivate(d).value, true);
});

test('checkHistoryPrivate — fails when a non-HistoryEngine file contains _undoStack', () => {
  const d = tmpDir({ 'HistoryEngine.js': 'const _undoStack = [];', 'Leak.js': 'const _undoStack = x;' });
  const r = checkHistoryPrivate(d);
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('Leak.js')));
});

test('checkHistoryPrivate — fails when a non-HistoryEngine file contains _redoStack', () => {
  const d = tmpDir({ 'HistoryEngine.js': 'const _redoStack = [];', 'Leak.js': 'this._redoStack = [];' });
  assert.equal(checkHistoryPrivate(d).value, false);
});

test('checkHistoryPrivate — passes with no engine files at all', () => {
  const d = tmpDir({ 'HistoryEngine.js': 'const _undoStack = [];' });
  assert.equal(checkHistoryPrivate(d).value, true);
});
