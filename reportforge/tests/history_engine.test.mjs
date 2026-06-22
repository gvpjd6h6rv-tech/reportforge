'use strict';
/**
 * SS-34 — HistoryEngine contracts (unit, behavior-observable only)
 *
 * Migrated from HistoryState.js coverage (P14C). HistoryEngine.js is a
 * DOM-bound singleton (closure-private _undoStack/_redoStack, per
 * immutability_guard.mjs RULE-A/B) — these tests deliberately never read
 * internal stack state. Everything is asserted through the public API:
 * push/undo/redo/canUndo/canRedo/suppress/onChange/clear, and through the
 * DS snapshot each restores.
 *
 * Loader stubs DS + the layout/overlay engines HistoryEngine calls on
 * restore, same pattern as race_conditions.test.mjs (P13B/P14B).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadHistoryEngine() {
  const calls = { canvasUpdate: 0, sectionUpdate: 0, canvasRenderAll: 0, overlayRender: 0 };
  const DS = {
    elements: [{ id: 'e0', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 'initial' }],
    sections: [{ id: 'ph', stype: 'pageHeader', height: 40 }],
    zoom: 1.0,
    setElements(els) { this.elements = els; },
    setSections(sects) { this.sections = sects; },
  };
  const CanvasLayoutEngine = {
    update() { calls.canvasUpdate++; },
    renderAll() { calls.canvasRenderAll++; },
  };
  const SectionLayoutEngine = { update() { calls.sectionUpdate++; } };
  const OverlayEngine = { render() { calls.overlayRender++; } };

  const ctx = {
    module: { exports: {} },
    console,
    DS,
    CanvasLayoutEngine,
    SectionLayoutEngine,
    OverlayEngine,
  };
  const src = fs.readFileSync(path.join(ROOT, 'engines/HistoryEngine.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  return { HistoryEngine: ctx.module.exports, DS, calls };
}

function setId(DS, id) {
  DS.setElements([{ id, type: 'text', x: 0, y: 0, w: 1, h: 1, text: id }]);
}

function currentId(DS) {
  return DS.elements[0].id;
}

// ---------------------------------------------------------------------------
// canUndo / canRedo
// ---------------------------------------------------------------------------

test('HistoryEngine — canUndo: false when undo stack empty', () => {
  const { HistoryEngine } = loadHistoryEngine();
  assert.equal(HistoryEngine.canUndo(), false);
});

test('HistoryEngine — canUndo: true after push', () => {
  const { HistoryEngine } = loadHistoryEngine();
  HistoryEngine.push('a');
  assert.equal(HistoryEngine.canUndo(), true);
});

test('HistoryEngine — canUndo: false after all entries undone', () => {
  const { HistoryEngine } = loadHistoryEngine();
  HistoryEngine.push('a');
  HistoryEngine.undo();
  assert.equal(HistoryEngine.canUndo(), false);
});

test('HistoryEngine — canRedo: false when redo stack empty', () => {
  const { HistoryEngine } = loadHistoryEngine();
  assert.equal(HistoryEngine.canRedo(), false);
});

test('HistoryEngine — canRedo: true after undo', () => {
  const { HistoryEngine } = loadHistoryEngine();
  HistoryEngine.push('a');
  HistoryEngine.undo();
  assert.equal(HistoryEngine.canRedo(), true);
});

// ---------------------------------------------------------------------------
// push / undo / redo round-trip
// ---------------------------------------------------------------------------

test('HistoryEngine — push/undo round-trip restores the pre-push state', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();
  setId(DS, 's0');
  HistoryEngine.push('action');
  setId(DS, 's1');

  assert.equal(HistoryEngine.undo(), true);
  assert.equal(currentId(DS), 's0', 'undo must restore the state captured at push time');
});

test('HistoryEngine — undo then redo returns to the post-action state', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();
  setId(DS, 's0');
  HistoryEngine.push('action');
  setId(DS, 's1');

  HistoryEngine.undo();
  assert.equal(currentId(DS), 's0');

  assert.equal(HistoryEngine.redo(), true);
  assert.equal(currentId(DS), 's1', 'redo must restore the state that existed before the undo');
});

test('HistoryEngine — undo() returns false when undo stack is empty', () => {
  const { HistoryEngine } = loadHistoryEngine();
  assert.equal(HistoryEngine.undo(), false);
});

test('HistoryEngine — redo() returns false when redo stack is empty', () => {
  const { HistoryEngine } = loadHistoryEngine();
  assert.equal(HistoryEngine.redo(), false);
});

// ---------------------------------------------------------------------------
// LIFO order
// ---------------------------------------------------------------------------

test('HistoryEngine — undo unwinds pushes in LIFO order', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();
  setId(DS, 's0');
  HistoryEngine.push('first');
  setId(DS, 's1');
  HistoryEngine.push('second');
  setId(DS, 's2');
  HistoryEngine.push('third');
  setId(DS, 's3');

  // current state is s3; each undo must peel back one push, most recent first
  HistoryEngine.undo();
  assert.equal(currentId(DS), 's2', 'first undo must restore the most recently pushed snapshot');
  HistoryEngine.undo();
  assert.equal(currentId(DS), 's1');
  HistoryEngine.undo();
  assert.equal(currentId(DS), 's0');
  assert.equal(HistoryEngine.undo(), false, 'no more entries after unwinding all three pushes');
});

test('HistoryEngine — redo rewinds in the reverse (FIFO from undo) order', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();
  setId(DS, 's0');
  HistoryEngine.push('first');
  setId(DS, 's1');
  HistoryEngine.push('second');
  setId(DS, 's2');

  HistoryEngine.undo(); // -> s1
  HistoryEngine.undo(); // -> s0
  HistoryEngine.redo();
  assert.equal(currentId(DS), 's1', 'first redo must restore the first undone state');
  HistoryEngine.redo();
  assert.equal(currentId(DS), 's2', 'second redo must restore the most recent pre-undo state');
});

// ---------------------------------------------------------------------------
// cap MAX_STACK — observable via undo() success count + eviction boundary
// ---------------------------------------------------------------------------

test('HistoryEngine — undo stack is capped at MAX_STACK=100, oldest entries evicted', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();
  const PUSHES = 150;

  for (let i = 0; i < PUSHES; i++) {
    setId(DS, `e${i}`);
    HistoryEngine.push(`action-${i}`);
  }

  let undoCount = 0;
  let lastRestoredId = null;
  while (HistoryEngine.undo()) {
    undoCount++;
    lastRestoredId = currentId(DS);
  }

  assert.equal(undoCount, 100, 'undo stack must be capped at MAX_STACK=100 regardless of push count');
  assert.equal(lastRestoredId, 'e50',
    'oldest surviving entry must be push #50 (150 pushes - 100 cap = 50 evicted from the front)');
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

test('HistoryEngine — clear empties both stacks (canUndo/canRedo become false)', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();
  setId(DS, 's0');
  HistoryEngine.push('a');
  setId(DS, 's1');
  HistoryEngine.push('b');
  HistoryEngine.undo(); // populate redo stack too

  assert.equal(HistoryEngine.canUndo(), true);
  assert.equal(HistoryEngine.canRedo(), true);

  HistoryEngine.clear();

  assert.equal(HistoryEngine.canUndo(), false, 'clear must empty the undo stack');
  assert.equal(HistoryEngine.canRedo(), false, 'clear must empty the redo stack');
  assert.equal(HistoryEngine.undo(), false, 'no entries left to undo after clear');
  assert.equal(HistoryEngine.redo(), false, 'no entries left to redo after clear');
});

test('HistoryEngine — clear notifies listeners', () => {
  const { HistoryEngine } = loadHistoryEngine();
  let notified = false;
  HistoryEngine.onChange(() => { notified = true; });
  HistoryEngine.clear();
  assert.equal(notified, true);
});

// ---------------------------------------------------------------------------
// onChange — triggered via push/clear (notify() itself is private)
// ---------------------------------------------------------------------------

test('HistoryEngine — onChange: listener fires on push with correct canUndo/canRedo/labels', () => {
  const { HistoryEngine } = loadHistoryEngine();
  let received = null;
  HistoryEngine.onChange((state) => { received = state; });
  HistoryEngine.push('move');

  assert.equal(received.canUndo, true);
  assert.equal(received.canRedo, false);
  assert.equal(received.undoLabel, 'move');
  assert.equal(received.redoLabel, null);
});

test('HistoryEngine — onChange: multiple listeners all fire', () => {
  const { HistoryEngine } = loadHistoryEngine();
  let count = 0;
  HistoryEngine.onChange(() => count++);
  HistoryEngine.onChange(() => count++);
  HistoryEngine.onChange(() => count++);
  HistoryEngine.push('a');
  assert.equal(count, 3);
});

test('HistoryEngine — onChange: a throwing listener does not block other listeners', () => {
  const { HistoryEngine } = loadHistoryEngine();
  let secondCalled = false;
  HistoryEngine.onChange(() => { throw new Error('bad listener'); });
  HistoryEngine.onChange(() => { secondCalled = true; });
  HistoryEngine.push('a'); // must not throw
  assert.equal(secondCalled, true);
});

test('HistoryEngine — onChange: repeated registration accumulates listeners (no dedup, no removeListener)', () => {
  // Migrated from memory_leak_detection.test.mjs's HistoryState test, proxied
  // through fire-count instead of reading st.listeners.length directly —
  // HistoryEngine's _listeners array is closure-private and not exposed.
  const { HistoryEngine } = loadHistoryEngine();
  const REGISTRATIONS = 50;
  let fired = 0;

  // Simulates the real-world bug this documents: a widget re-mounting and
  // re-registering the same onChange callback without ever cleaning up.
  for (let i = 0; i < REGISTRATIONS; i++) {
    HistoryEngine.onChange(() => { fired++; });
  }

  HistoryEngine.push('action'); // single state-changing op → exactly one notify

  assert.equal(fired, REGISTRATIONS,
    `each of the ${REGISTRATIONS} registered listeners must fire exactly once per notify — ` +
    'documents accumulation as known behavior (no removeListener API exists to undo over-registration)');
});

// ---------------------------------------------------------------------------
// suppress — by effect (push becomes a no-op) and by return value
// ---------------------------------------------------------------------------

test('HistoryEngine — suppress: push() inside suppress is a no-op', () => {
  const { HistoryEngine } = loadHistoryEngine();
  HistoryEngine.suppress(() => {
    HistoryEngine.push('should be ignored');
  });
  assert.equal(HistoryEngine.canUndo(), false,
    'push() called inside suppress(fn) must not add an undo entry');
});

test('HistoryEngine — suppress: push() works normally again after suppress completes', () => {
  const { HistoryEngine } = loadHistoryEngine();
  HistoryEngine.suppress(() => {
    HistoryEngine.push('ignored');
  });
  HistoryEngine.push('real action');
  assert.equal(HistoryEngine.canUndo(), true,
    'suppress must release after completion — subsequent push() must work');
});

test('HistoryEngine — suppress: flag releases even if fn throws (push works again afterward)', () => {
  const { HistoryEngine } = loadHistoryEngine();
  try {
    HistoryEngine.suppress(() => { throw new Error('boom'); });
  } catch (_) { /* expected */ }

  HistoryEngine.push('after error');
  assert.equal(HistoryEngine.canUndo(), true,
    'suppress finally-clause must release the flag even when fn throws');
});

test('HistoryEngine — suppress: returns the value produced by fn', () => {
  const { HistoryEngine } = loadHistoryEngine();
  const result = HistoryEngine.suppress(() => 42);
  assert.equal(result, 42);
});

test('HistoryEngine — nested suppress is NOT re-entrant (documents known limitation)', () => {
  // Migrated from memory_leak_detection.test.mjs's HistoryState test. That
  // version reads st.suppressed directly at three points in time — not
  // possible here since _suppressed is closure-private. Proxied through the
  // observable consequence instead: HistoryEngine.suppress has no depth
  // counter, so an inner suppress's `finally` releases the flag the instant
  // it completes, even while an outer suppress is still executing. A push()
  // issued after the inner call but still inside the outer callback is
  // therefore NOT blocked — which is the real-world risk this documents
  // (an unexpected history entry sneaking in during what should still be a
  // suppressed outer scope).
  const { HistoryEngine } = loadHistoryEngine();
  let pushSucceededInsideOuter = null;

  HistoryEngine.suppress(() => {
    HistoryEngine.suppress(() => {}); // inner releases _suppressed on completion
    HistoryEngine.push('attempted while outer suppress is still active');
    pushSucceededInsideOuter = HistoryEngine.canUndo();
  });

  assert.equal(pushSucceededInsideOuter, true,
    'KNOWN: nested suppress is not re-entrant — push() succeeds inside the outer ' +
    'callback once the inner suppress releases the flag (no depth counter)');
  assert.equal(HistoryEngine.canUndo(), true,
    'after both callbacks complete: the entry pushed during the gap must remain');
});

// ---------------------------------------------------------------------------
// redo cleared after new push
// ---------------------------------------------------------------------------

test('HistoryEngine — a new push() invalidates the redo stack', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();
  setId(DS, 's0');
  HistoryEngine.push('a');
  setId(DS, 's1');

  HistoryEngine.undo(); // populates redo stack
  assert.equal(HistoryEngine.canRedo(), true, 'sanity: redo available after undo');

  HistoryEngine.push('new action'); // must invalidate redo
  assert.equal(HistoryEngine.canRedo(), false, 'a new push must clear the redo stack');
  assert.equal(HistoryEngine.redo(), false, 'redo() must fail after redo stack was invalidated by push');
});
