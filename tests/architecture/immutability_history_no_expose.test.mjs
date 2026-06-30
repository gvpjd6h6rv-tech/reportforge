'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkHistoryNoExpose } from '../../tools/guards/immutability/immutability_history_no_expose.mjs';

function tmpDir(src) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  fs.writeFileSync(path.join(d, 'HistoryEngine.js'), src);
  return d;
}

test('checkHistoryNoExpose — passes when return object does not expose stacks', () => {
  const d = tmpDir('function H() { const _undoStack=[]; return { push(){}, undo(){} }; }');
  assert.equal(checkHistoryNoExpose(d).value, true);
});

test('checkHistoryNoExpose — fails when undoStack exposed in return object', () => {
  const d = tmpDir('function H() { const _undoStack=[]; return { undoStack, push(){} }; }');
  const r = checkHistoryNoExpose(d);
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('_undoStack')));
});

test('checkHistoryNoExpose — fails when redoStack exposed in return object', () => {
  const d = tmpDir('function H() { const _redoStack=[]; return { redoStack, undo(){} }; }');
  assert.equal(checkHistoryNoExpose(d).value, false);
});

test('checkHistoryNoExpose — passes when stacks mentioned only inside methods', () => {
  const d = tmpDir('function H() { const _undoStack=[]; return { undo(){ return _undoStack.pop(); } }; }');
  assert.equal(checkHistoryNoExpose(d).value, true);
});
