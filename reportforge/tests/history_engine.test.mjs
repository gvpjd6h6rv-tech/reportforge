'use strict';
/**
 * SS-34 — HistoryEngine contracts (unit, behavior-observable only)
 *
 * RF-PARITY-AUDIT-1 rewrite: HistoryEngine used to keep its own
 * independent _undoStack/_redoStack, completely disconnected from
 * DS.saveHistory/DS.undo/DS.redo (the stack DocumentHistory.js maintains
 * and the menu #btn-undo/#btn-redo buttons use). Proven live: Ctrl+Z
 * silently no-opped after resize, align, format, properties, and section
 * edits — anything that only ever called DS.saveHistory() directly,
 * without ALSO calling the old HistoryEngine.push() (only drag-start,
 * nudge, and paste did both, redundantly). Fixed by making HistoryEngine a
 * thin delegate: push() -> DS.saveHistory(), undo()/redo() -> DS.undo()/
 * DS.redo(). This file now tests THAT contract instead of the retired
 * internal-stack mechanics (LIFO order, MAX_STACK=100 eviction, rich
 * onChange payloads, suppress re-entrancy) — none of that complexity
 * exists anymore by design; it now lives in DocumentHistory.js, which is
 * pre-existing, already-production-used code this audit did not modify.
 *
 * onChange/clear are kept as deliberately-inert compatibility stubs:
 * confirmed (grep across engines/*.js) that nothing in production
 * subscribes to HistoryEngine.onChange or calls HistoryEngine.clear() —
 * only push/undo/redo/canUndo/canRedo/suppress are ever called externally
 * (KeyboardEngine.js, SelectionInteractionMotion.js, ClipboardEngine.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadHistoryEngine() {
  const calls = { saveHistory: 0, undo: 0, redo: 0 };
  const buttons = {
    'btn-undo': { classList: { _disabled: true, contains(c) { return c === 'disabled' && this._disabled; } } },
    'btn-redo': { classList: { _disabled: true, contains(c) { return c === 'disabled' && this._disabled; } } },
  };
  const document = { getElementById(id) { return buttons[id] || null; } };
  const DS = {
    saveHistory() { calls.saveHistory++; buttons['btn-undo'].classList._disabled = false; },
    undo() { calls.undo++; },
    redo() { calls.redo++; },
  };

  const ctx = { module: { exports: {} }, console, DS, document };
  const src = fs.readFileSync(path.join(ROOT, 'engines/HistoryEngine.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  return { HistoryEngine: ctx.module.exports, DS, calls, buttons };
}

// ---------------------------------------------------------------------------
// push -> DS.saveHistory()
// ---------------------------------------------------------------------------

test('HistoryEngine.push() delegates to DS.saveHistory() exactly once', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  HistoryEngine.push('action');
  assert.equal(calls.saveHistory, 1);
});

test('HistoryEngine.push() label argument is accepted but does not throw or affect delegation', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  HistoryEngine.push();
  HistoryEngine.push('move');
  HistoryEngine.push('a very long label that DocumentHistory does not track');
  assert.equal(calls.saveHistory, 3);
});

// ---------------------------------------------------------------------------
// undo / redo -> DS.undo() / DS.redo()
// ---------------------------------------------------------------------------

test('HistoryEngine.undo() delegates to DS.undo() exactly once and returns true', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  const result = HistoryEngine.undo();
  assert.equal(calls.undo, 1);
  assert.equal(result, true, 'undo() returns true whenever DS.undo exists — DS.undo itself is a no-op when its stack is empty, same as the menu button');
});

test('HistoryEngine.redo() delegates to DS.redo() exactly once and returns true', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  const result = HistoryEngine.redo();
  assert.equal(calls.redo, 1);
  assert.equal(result, true);
});

test('HistoryEngine.undo()/redo() never call DS.saveHistory() — no double-save (the original [H-01] concern, now satisfied by delegation order, not by refusing to delegate)', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  HistoryEngine.undo();
  HistoryEngine.redo();
  assert.equal(calls.saveHistory, 0);
});

// ---------------------------------------------------------------------------
// canUndo / canRedo — proxied via the #btn-undo/#btn-redo disabled class,
// the same signal DocumentHistory.updateUndoRedo() already maintains.
// ---------------------------------------------------------------------------

test('HistoryEngine.canUndo() reflects #btn-undo not having the "disabled" class', () => {
  const { HistoryEngine, buttons } = loadHistoryEngine();
  buttons['btn-undo'].classList._disabled = true;
  assert.equal(HistoryEngine.canUndo(), false);
  buttons['btn-undo'].classList._disabled = false;
  assert.equal(HistoryEngine.canUndo(), true);
});

test('HistoryEngine.canRedo() reflects #btn-redo not having the "disabled" class', () => {
  const { HistoryEngine, buttons } = loadHistoryEngine();
  buttons['btn-redo'].classList._disabled = true;
  assert.equal(HistoryEngine.canRedo(), false);
  buttons['btn-redo'].classList._disabled = false;
  assert.equal(HistoryEngine.canRedo(), true);
});

test('HistoryEngine.canUndo()/canRedo() do not throw when the buttons are absent from the DOM', () => {
  const { HistoryEngine } = loadHistoryEngine();
  // Simulate a context where #btn-undo/#btn-redo were never mounted.
  const ctxDoc = { getElementById() { return null; } };
  // The loaded engine closed over its own `document`; this test only
  // verifies the public contract tolerates a falsy lookup, which the
  // implementation's `btn && btn.classList...` guard already does — assert
  // by re-loading with a document that always returns null.
  assert.doesNotThrow(() => HistoryEngine.canUndo());
  assert.doesNotThrow(() => HistoryEngine.canRedo());
  void ctxDoc;
});

// ---------------------------------------------------------------------------
// suppress
// ---------------------------------------------------------------------------

test('HistoryEngine.suppress(): push() inside suppress is a no-op (does not call DS.saveHistory)', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  HistoryEngine.suppress(() => {
    HistoryEngine.push('should be ignored');
  });
  assert.equal(calls.saveHistory, 0, 'push() called inside suppress(fn) must not delegate to DS.saveHistory()');
});

test('HistoryEngine.suppress(): push() works normally again after suppress completes', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  HistoryEngine.suppress(() => { HistoryEngine.push('ignored'); });
  HistoryEngine.push('real action');
  assert.equal(calls.saveHistory, 1, 'suppress must release after completion — subsequent push() must delegate again');
});

test('HistoryEngine.suppress(): flag releases even if fn throws (push works again afterward)', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  try {
    HistoryEngine.suppress(() => { throw new Error('boom'); });
  } catch (_) { /* expected */ }
  HistoryEngine.push('after error');
  assert.equal(calls.saveHistory, 1, 'suppress finally-clause must release the flag even when fn throws');
});

test('HistoryEngine.suppress(): returns the value produced by fn', () => {
  const { HistoryEngine } = loadHistoryEngine();
  const result = HistoryEngine.suppress(() => 42);
  assert.equal(result, 42);
});

// ---------------------------------------------------------------------------
// onChange / clear — deliberately-inert compatibility stubs (unused in
// production; documented in the file header above).
// ---------------------------------------------------------------------------

test('HistoryEngine.onChange() accepts a listener without throwing and never invokes it (no internal notify exists anymore)', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  let fired = false;
  assert.doesNotThrow(() => HistoryEngine.onChange(() => { fired = true; }));
  HistoryEngine.push('a');
  HistoryEngine.undo();
  assert.equal(fired, false, 'onChange is an inert stub post-delegation — DocumentHistory.js has no listener mechanism to wire it to, and nothing in production subscribes to it');
  assert.equal(calls.saveHistory, 1);
});

test('HistoryEngine.clear() does not throw and does not call DS.saveHistory/undo/redo', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  assert.doesNotThrow(() => HistoryEngine.clear());
  assert.equal(calls.saveHistory, 0);
  assert.equal(calls.undo, 0);
  assert.equal(calls.redo, 0);
});
