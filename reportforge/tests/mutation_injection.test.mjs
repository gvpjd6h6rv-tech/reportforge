'use strict';
/**
 * MUTATION INJECTION — Bug Injection / Mutation Testing
 *
 * Pregunta que responde: ¿nuestros tests detectan bugs reales o solo verifican el happy path?
 *
 * Método:
 *   1. Cargar source de engines puras (GeometryCore) o stubbed (HistoryEngine)
 *   2. Aplicar una mutación concreta (cambio de operador, off-by-one, flip de condición)
 *   3. Correr las mismas assertions del test suite contra el código mutado
 *   4. Exigir que la assertion FALLE → mutación "killed"
 *   5. Si la assertion pasa con código mutado → mutación "survived" → gap de cobertura
 *
 * Un survivor es una alarma de CI. Kill rate debe ser 100%.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const BASE_CTX = () => ({
  Math,
  Number,
  String,
  Array,
  Infinity,
  isNaN,
  isFinite,
  parseInt,
  parseFloat,
  module: { exports: {} },
});

/**
 * Carga el engine original en ctx limpio, verifica que el baseline pasa,
 * aplica la mutación, verifica que la assertion falla (killed).
 */
function assertMutationKilled(srcPath, mutateFn, assertFn, label) {
  const src = fs.readFileSync(srcPath, 'utf8');

  // --- baseline debe pasar ---
  const base = BASE_CTX();
  vm.runInNewContext(src, base);
  assertFn(base.module.exports); // lanza si baseline está roto

  // --- mutación debe ser detectada ---
  const mutated = mutateFn(src);
  if (mutated === src) throw new Error(`Mutation did not change source: ${label}`);
  const mctx = BASE_CTX();
  vm.runInNewContext(mutated, mctx);

  let killed = false;
  try {
    assertFn(mctx.module.exports);
  } catch {
    killed = true;
  }
  assert.ok(killed, `SURVIVOR — mutation not detected (test gap): ${label}`);
}

// ---------------------------------------------------------------------------
// Tier A — GeometryCore arithmetic & relational operators
// ---------------------------------------------------------------------------

test('mutation kill — GeometryCore: rectUnion min→max flips bounding box origin', () => {
  const src = path.join(ROOT, 'engines/GeometryCore.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'const x = Math.min(ra.x, rb.x);',
      'const x = Math.max(ra.x, rb.x);',
    ),
    (G) => {
      const a = G.makeRect(0, 0, 10, 10);
      const b = G.makeRect(20, 0, 10, 10);
      const u = G.rectUnion(a, b);
      assert.equal(u.x, 0, 'union x must be leftmost origin');
      assert.equal(u.w, 30, 'union width must span both rects');
    },
    'rectUnion: Math.min(x) → Math.max(x)',
  );
});

test('mutation kill — GeometryCore: rectUnion max→min collapses x2', () => {
  const src = path.join(ROOT, 'engines/GeometryCore.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'const x2 = Math.max(ra.x + ra.w, rb.x + rb.w);',
      'const x2 = Math.min(ra.x + ra.w, rb.x + rb.w);',
    ),
    (G) => {
      const a = G.makeRect(0, 0, 10, 10);
      const b = G.makeRect(20, 0, 10, 10);
      const u = G.rectUnion(a, b);
      assert.equal(u.w, 30, 'union width must span both rects');
    },
    'rectUnion: Math.max(x2) → Math.min(x2)',
  );
});

test('mutation kill — GeometryCore: rectIntersect boundary off-by-one', () => {
  const src = path.join(ROOT, 'engines/GeometryCore.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'if (x2 <= x || y2 <= y) return null;',
      'if (x2 < x || y2 < y) return null;',
    ),
    (G) => {
      // Rects that touch exactly at a single edge — should NOT intersect (area = 0)
      const a = G.makeRect(0, 0, 10, 10);
      const b = G.makeRect(10, 0, 10, 10); // touches right edge of a
      const result = G.rectIntersect(a, b);
      assert.equal(result, null, 'touching-edge rects must not produce an intersection');
    },
    'rectIntersect: x2 <= x → x2 < x (off-by-one on boundary)',
  );
});

test('mutation kill — GeometryCore: snapValue round→floor changes rounding', () => {
  const src = path.join(ROOT, 'engines/GeometryCore.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'return Math.round((Number(value) || 0) / g) * g;',
      'return Math.floor((Number(value) || 0) / g) * g;',
    ),
    (G) => {
      // 13 snapped to grid 5 → nearest is 15, not 10
      assert.equal(G.snapValue(13, 5), 15, 'snapValue must round to nearest, not floor');
    },
    'snapValue: Math.round → Math.floor',
  );
});

test('mutation kill — GeometryCore: rectContainsPoint >= flipped to >', () => {
  const src = path.join(ROOT, 'engines/GeometryCore.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'return point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h;',
      'return point.x > r.x && point.x <= r.x + r.w && point.y > r.y && point.y <= r.y + r.h;',
    ),
    (G) => {
      const rect = G.makeRect(10, 10, 20, 20);
      // Point exactly on the left edge must be contained
      assert.ok(G.rectContainsPoint(rect, { x: 10, y: 15 }), 'left-edge point must be inside rect');
    },
    'rectContainsPoint: >= r.x → > r.x (misses left/top edge)',
  );
});

test('mutation kill — GeometryCore: inflateRect sign flip on amount', () => {
  const src = path.join(ROOT, 'engines/GeometryCore.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'return makeRect(r.x - amount, r.y - amount, r.w + amount * 2, r.h + amount * 2);',
      'return makeRect(r.x + amount, r.y + amount, r.w + amount * 2, r.h + amount * 2);',
    ),
    (G) => {
      const r = G.makeRect(10, 10, 20, 20);
      const inflated = G.inflateRect(r, 5);
      assert.equal(inflated.x, 5, 'inflated x must move left (origin decreases)');
    },
    'inflateRect: r.x - amount → r.x + amount',
  );
});

// ---------------------------------------------------------------------------
// Tier B — HistoryEngine boundary guards & stack semantics
// (migrated from HistoryState.js in P14F — HistoryState.js retired, its
// internals were exposed for test isolation; HistoryEngine.js is a DOM-bound
// singleton with closure-private stacks, so these tests load it with DS/
// layout-engine stubs and assert through the public API + restored DS state,
// never reading _undoStack/_redoStack directly.)
// ---------------------------------------------------------------------------

function loadHistoryEngineForMutation(src) {
  const calls = { saveHistory: 0, undo: 0, redo: 0 };
  const buttons = {
    'btn-undo': { classList: { _disabled: false, contains(c) { return c === 'disabled' && this._disabled; } } },
    'btn-redo': { classList: { _disabled: false, contains(c) { return c === 'disabled' && this._disabled; } } },
  };
  const document = { getElementById(id) { return buttons[id] || null; } };
  const DS = {
    saveHistory() { calls.saveHistory++; },
    undo() { calls.undo++; },
    redo() { calls.redo++; },
  };
  const ctx = { module: { exports: {} }, console, DS, document };
  vm.runInNewContext(src, ctx);
  return { HistoryEngine: ctx.module.exports, DS, calls, buttons };
}

/**
 * Same baseline/mutant flow as assertMutationKilled, but for HistoryEngine.js,
 * which needs DS + layout-engine stubs instead of the bare BASE_CTX.
 */
function assertHistoryEngineMutationKilled(mutateFn, runFn, label) {
  const srcPath = path.join(ROOT, 'engines/HistoryEngine.js');
  const src = fs.readFileSync(srcPath, 'utf8');

  const baseline = loadHistoryEngineForMutation(src);
  runFn(baseline.HistoryEngine, baseline.DS, baseline.calls, baseline.buttons); // throws if baseline is broken

  const mutated = mutateFn(src);
  if (mutated === src) throw new Error(`Mutation did not change source: ${label}`);
  const mutant = loadHistoryEngineForMutation(mutated);

  let killed = false;
  try {
    runFn(mutant.HistoryEngine, mutant.DS, mutant.calls, mutant.buttons);
  } catch {
    killed = true;
  }
  assert.ok(killed, `SURVIVOR — mutation not detected (test gap): ${label}`);
}

// RF-PARITY-AUDIT-1: HistoryEngine no longer has its own _undoStack/
// _redoStack — it delegates to DS.saveHistory/undo/redo (the stack
// DocumentHistory.js maintains, also used by the menu #btn-undo/#btn-redo
// buttons). The mutation targets below were rewritten against the actual
// remaining logic (the suppress guard, the delegate calls, the canUndo/
// canRedo negation) instead of internal stack mechanics that no longer
// exist (shift/pop, length>0 vs >1, _redoStack.length=0 reset).

test('mutation kill — HistoryEngine: suppress guard removed lets push() through during suppress', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace('if (_suppressed) return;', 'if (false) return;'),
    (H, DS, calls) => {
      H.suppress(() => { H.push('should be ignored'); });
      assert.equal(calls.saveHistory, 0, 'push() inside suppress must not call DS.saveHistory()');
    },
    'HistoryEngine: push() suppress guard `if (_suppressed) return;` disabled',
  );
});

test('mutation kill — HistoryEngine: push() delegates to the wrong DS method', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace(
      "if (typeof DS !== 'undefined' && typeof DS.saveHistory === 'function') DS.saveHistory();",
      "if (typeof DS !== 'undefined' && typeof DS.undo === 'function') DS.undo();",
    ),
    (H, DS, calls) => {
      H.push('action');
      assert.equal(calls.saveHistory, 1, 'push() must call DS.saveHistory(), not DS.undo()');
      assert.equal(calls.undo, 0);
    },
    'HistoryEngine: push() DS.saveHistory() swapped for DS.undo()',
  );
});

test('mutation kill — HistoryEngine: undo() delegates to DS.redo() instead of DS.undo()', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace(
      "if (typeof DS === 'undefined' || typeof DS.undo !== 'function') return false;\n      DS.undo();",
      "if (typeof DS === 'undefined' || typeof DS.undo !== 'function') return false;\n      DS.redo();",
    ),
    (H, DS, calls) => {
      H.undo();
      assert.equal(calls.undo, 1, 'undo() must call DS.undo(), not DS.redo()');
      assert.equal(calls.redo, 0);
    },
    'HistoryEngine: undo() DS.undo() swapped for DS.redo()',
  );
});

test('mutation kill — HistoryEngine: canUndo() negation removed inverts the result', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace("canUndo() { return !_undoRedoDisabled('btn-undo'); }", "canUndo() { return _undoRedoDisabled('btn-undo'); }"),
    (H, DS, calls, buttons) => {
      buttons['btn-undo'].classList._disabled = false; // button enabled -> canUndo must be true
      assert.equal(H.canUndo(), true, 'canUndo() must be true when #btn-undo is not disabled');
    },
    'HistoryEngine: canUndo() `!` negation removed',
  );
});

test('mutation kill — HistoryEngine: suppress does not release (finally removed)', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace(
      'try { return fn(); } finally { _suppressed = false; }',
      'return fn();',
    ),
    (H, DS, calls) => {
      H.suppress(() => {});
      H.push('after'); // if the flag never released, this push is silently dropped
      assert.equal(calls.saveHistory, 1, 'suppress must release the flag so a later push() succeeds');
    },
    'HistoryEngine: suppress finally { _suppressed = false } removed',
  );
});

// ---------------------------------------------------------------------------
// Tier C — Kill rate summary
// ---------------------------------------------------------------------------

test('mutation kill rate — 100% required (zero survivors allowed)', () => {
  // This test is a sentinel: if all above pass, kill rate is 100%.
  // If any above test failed with "SURVIVOR", CI already broke there.
  // This test documents the contract explicitly.
  const mutations = [
    'rectUnion min→max',
    'rectUnion max→min',
    'rectIntersect off-by-one',
    'snapValue round→floor',
    'rectContainsPoint edge miss',
    'inflateRect sign flip',
    'HistoryEngine suppress guard disabled',
    'HistoryEngine push() wrong DS delegate',
    'HistoryEngine undo() wrong DS delegate',
    'HistoryEngine canUndo() negation removed',
    'HistoryEngine suppress no-release',
  ];
  assert.equal(mutations.length, 11, 'mutation suite must cover exactly 11 operators');
  // Operators covered: AOR×4, ROR×2, COR×1, SBR×2, UOI×2
  const coverage = { AOR: 4, ROR: 2, COR: 1, SBR: 2, UOI: 2 };
  assert.equal(Object.values(coverage).reduce((a, b) => a + b, 0), 11);
});
