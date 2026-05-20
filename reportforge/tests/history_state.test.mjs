'use strict';
/**
 * SS-02 — HistoryState contracts
 * Covers createHistoryState: push/pop undo/redo stacks, cap enforcement,
 * clearRedo, canUndo/canRedo, suppress, onChange listeners, summary, clear.
 * All tests use require() — no vm, no DOM, no globals required.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HS      = require('../../engines/HistoryState.js');

function make(max) { return HS.createHistoryState(max); }

// ── pushUndo / popUndo ────────────────────────────────────────────────────────

test('pushUndo — entry appended to undoStack', () => {
  const s = make();
  s.pushUndo({ label: 'a', snapshot: 'snap1' });
  assert.equal(s.undoStack.length, 1);
  assert.equal(s.undoStack[0].label, 'a');
});

test('pushUndo — multiple entries maintain LIFO order', () => {
  const s = make();
  s.pushUndo({ label: 'first',  snapshot: 's1' });
  s.pushUndo({ label: 'second', snapshot: 's2' });
  s.pushUndo({ label: 'third',  snapshot: 's3' });
  assert.equal(s.undoStack.length, 3);
  assert.equal(s.undoStack[2].label, 'third');
});

test('pushUndo — cap enforcement: oldest entry evicted when maxStack exceeded', () => {
  const s = make(3);
  s.pushUndo({ label: 'a', snapshot: 'sa' });
  s.pushUndo({ label: 'b', snapshot: 'sb' });
  s.pushUndo({ label: 'c', snapshot: 'sc' });
  s.pushUndo({ label: 'd', snapshot: 'sd' });  // evicts 'a'
  assert.equal(s.undoStack.length, 3);
  assert.equal(s.undoStack[0].label, 'b');
  assert.equal(s.undoStack[2].label, 'd');
});

test('popUndo — returns last entry and removes it', () => {
  const s = make();
  s.pushUndo({ label: 'x', snapshot: 'sx' });
  s.pushUndo({ label: 'y', snapshot: 'sy' });
  const popped = s.popUndo();
  assert.equal(popped.label, 'y');
  assert.equal(s.undoStack.length, 1);
});

test('popUndo — returns null when stack empty', () => {
  const s = make();
  assert.equal(s.popUndo(), null);
});

// ── pushRedo / popRedo ────────────────────────────────────────────────────────

test('pushRedo — entry appended to redoStack', () => {
  const s = make();
  s.pushRedo({ label: 'r', snapshot: 'sr' });
  assert.equal(s.redoStack.length, 1);
});

test('pushRedo — cap enforcement on redoStack', () => {
  const s = make(2);
  s.pushRedo({ label: 'a', snapshot: 'sa' });
  s.pushRedo({ label: 'b', snapshot: 'sb' });
  s.pushRedo({ label: 'c', snapshot: 'sc' });  // evicts 'a'
  assert.equal(s.redoStack.length, 2);
  assert.equal(s.redoStack[0].label, 'b');
});

test('popRedo — returns last entry and removes it', () => {
  const s = make();
  s.pushRedo({ label: 'r1', snapshot: 'sr1' });
  s.pushRedo({ label: 'r2', snapshot: 'sr2' });
  const popped = s.popRedo();
  assert.equal(popped.label, 'r2');
  assert.equal(s.redoStack.length, 1);
});

test('popRedo — returns null when stack empty', () => {
  const s = make();
  assert.equal(s.popRedo(), null);
});

// ── clearRedo ─────────────────────────────────────────────────────────────────

test('clearRedo — empties redoStack, leaves undoStack intact', () => {
  const s = make();
  s.pushUndo({ label: 'u', snapshot: 'su' });
  s.pushRedo({ label: 'r', snapshot: 'sr' });
  s.clearRedo();
  assert.equal(s.redoStack.length, 0);
  assert.equal(s.undoStack.length, 1);  // unchanged
});

test('clearRedo — no-op on already empty redoStack', () => {
  const s = make();
  s.clearRedo();
  assert.equal(s.redoStack.length, 0);
});

// ── canUndo / canRedo ─────────────────────────────────────────────────────────

test('canUndo — false when undoStack empty', () => {
  const s = make();
  assert.equal(s.canUndo(), false);
});

test('canUndo — true after pushUndo', () => {
  const s = make();
  s.pushUndo({ label: 'a', snapshot: 's' });
  assert.equal(s.canUndo(), true);
});

test('canUndo — false after all entries popped', () => {
  const s = make();
  s.pushUndo({ label: 'a', snapshot: 's' });
  s.popUndo();
  assert.equal(s.canUndo(), false);
});

test('canRedo — false when redoStack empty', () => {
  const s = make();
  assert.equal(s.canRedo(), false);
});

test('canRedo — true after pushRedo', () => {
  const s = make();
  s.pushRedo({ label: 'r', snapshot: 'sr' });
  assert.equal(s.canRedo(), true);
});

// ── suppress ──────────────────────────────────────────────────────────────────

test('suppress — suppressed flag true inside fn, false outside', () => {
  const s = make();
  let insideValue;
  s.suppress(() => {
    insideValue = s.suppressed;
  });
  assert.equal(insideValue, true);
  assert.equal(s.suppressed, false);
});

test('suppress — restores suppressed=false even if fn throws', () => {
  const s = make();
  try { s.suppress(() => { throw new Error('boom'); }); } catch (_) {}
  assert.equal(s.suppressed, false);
});

test('suppress — returns fn return value', () => {
  const s = make();
  const result = s.suppress(() => 42);
  assert.equal(result, 42);
});

// ── onChange / notify ─────────────────────────────────────────────────────────

test('onChange — listener called when notify() invoked', () => {
  const s = make();
  let called = false;
  s.onChange(() => { called = true; });
  s.notify();
  assert.equal(called, true);
});

test('onChange — listener receives correct state object', () => {
  const s = make();
  let received;
  s.onChange(state => { received = state; });
  s.pushUndo({ label: 'u', snapshot: 'su' });
  s.notify();
  assert.equal(received.canUndo, true);
  assert.equal(received.canRedo, false);
  assert.equal(received.undoLabel, 'u');
  assert.equal(received.redoLabel, null);
});

test('onChange — multiple listeners all called', () => {
  const s = make();
  let count = 0;
  s.onChange(() => count++);
  s.onChange(() => count++);
  s.onChange(() => count++);
  s.notify();
  assert.equal(count, 3);
});

test('onChange — listener exception does not break other listeners', () => {
  const s = make();
  let secondCalled = false;
  s.onChange(() => { throw new Error('bad listener'); });
  s.onChange(() => { secondCalled = true; });
  s.notify();  // should not throw
  assert.equal(secondCalled, true);
});

// ── summary ───────────────────────────────────────────────────────────────────

test('summary — empty state returns all-false flags, null labels', () => {
  const s = make();
  const sum = s.summary();
  assert.equal(sum.canUndo,    false);
  assert.equal(sum.canRedo,    false);
  assert.equal(sum.undoLabel,  null);
  assert.equal(sum.redoLabel,  null);
});

test('summary — reflects current stack tops as labels', () => {
  const s = make();
  s.pushUndo({ label: 'move', snapshot: 'su' });
  s.pushRedo({ label: 'paste', snapshot: 'sr' });
  const sum = s.summary();
  assert.equal(sum.canUndo,   true);
  assert.equal(sum.canRedo,   true);
  assert.equal(sum.undoLabel, 'move');
  assert.equal(sum.redoLabel, 'paste');
});

// ── clear ─────────────────────────────────────────────────────────────────────

test('clear — empties both stacks', () => {
  const s = make();
  s.pushUndo({ label: 'u', snapshot: 'su' });
  s.pushRedo({ label: 'r', snapshot: 'sr' });
  s.clear();
  assert.equal(s.undoStack.length, 0);
  assert.equal(s.redoStack.length, 0);
});

test('clear — canUndo and canRedo become false', () => {
  const s = make();
  s.pushUndo({ label: 'u', snapshot: 'su' });
  s.pushRedo({ label: 'r', snapshot: 'sr' });
  s.clear();
  assert.equal(s.canUndo(), false);
  assert.equal(s.canRedo(), false);
});

test('clear — notifies listeners', () => {
  const s = make();
  let notified = false;
  s.onChange(() => { notified = true; });
  s.clear();
  assert.equal(notified, true);
});

// ── maxStack default ──────────────────────────────────────────────────────────

test('createHistoryState default maxStack = 100', () => {
  const s = make();
  assert.equal(s.maxStack, 100);
});

test('createHistoryState custom maxStack respected', () => {
  const s = make(5);
  assert.equal(s.maxStack, 5);
});
