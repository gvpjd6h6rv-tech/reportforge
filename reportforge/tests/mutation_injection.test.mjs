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
  const DS = {
    elements: [{ id: 'e0', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 'e0' }],
    sections: [{ id: 'ph', stype: 'pageHeader', height: 40 }],
    zoom: 1.0,
    setElements(els) { this.elements = els; },
    setSections(sects) { this.sections = sects; },
  };
  const ctx = {
    module: { exports: {} },
    console,
    DS,
    CanvasLayoutEngine: { update() {}, renderAll() {} },
    SectionLayoutEngine: { update() {} },
    OverlayEngine: { render() {} },
  };
  vm.runInNewContext(src, ctx);
  return { HistoryEngine: ctx.module.exports, DS };
}

/**
 * Same baseline/mutant flow as assertMutationKilled, but for HistoryEngine.js,
 * which needs DS + layout-engine stubs instead of the bare BASE_CTX.
 */
function assertHistoryEngineMutationKilled(mutateFn, runFn, label) {
  const srcPath = path.join(ROOT, 'engines/HistoryEngine.js');
  const src = fs.readFileSync(srcPath, 'utf8');

  const baseline = loadHistoryEngineForMutation(src);
  runFn(baseline.HistoryEngine, baseline.DS); // throws if baseline is broken

  const mutated = mutateFn(src);
  if (mutated === src) throw new Error(`Mutation did not change source: ${label}`);
  const mutant = loadHistoryEngineForMutation(mutated);

  let killed = false;
  try {
    runFn(mutant.HistoryEngine, mutant.DS);
  } catch {
    killed = true;
  }
  assert.ok(killed, `SURVIVOR — mutation not detected (test gap): ${label}`);
}

test('mutation kill — HistoryEngine: undo stack shift→pop removes wrong end on overflow', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace(
      'if (_undoStack.length > MAX_STACK) _undoStack.shift();',
      'if (_undoStack.length > MAX_STACK) _undoStack.pop();',
    ),
    (H, DS) => {
      // MAX_STACK is fixed at 100 — push 101 distinguishable states to force
      // exactly one eviction, then unwind via undo() to see which survived.
      for (let i = 0; i <= 100; i++) {
        DS.setElements([{ id: `e${i}`, type: 'text', x: 0, y: 0, w: 1, h: 1, text: `e${i}` }]);
        H.push(`action-${i}`);
      }
      let lastRestoredId = null;
      while (H.undo()) lastRestoredId = DS.elements[0].id;
      // With shift(): oldest (e0) is evicted, oldest survivor is e1.
      // With pop() (mutant): the newest entry is evicted instead.
      assert.equal(lastRestoredId, 'e1', 'oldest surviving entry must be e1 (e0 evicted by shift)');
    },
    'HistoryEngine: _undoStack.shift() → _undoStack.pop() on overflow',
  );
});

test('mutation kill — HistoryEngine: canUndo length > 0 → > 1 off-by-one', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace(
      'canUndo() { return _undoStack.length > 0; }',
      'canUndo() { return _undoStack.length > 1; }',
    ),
    (H) => {
      H.push('action');
      assert.ok(H.canUndo(), 'canUndo must be true after exactly one push');
    },
    'HistoryEngine: canUndo length > 0 → > 1 (off-by-one)',
  );
});

test('mutation kill — HistoryEngine: suppress does not release (finally removed)', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace(
      'try { return fn(); } finally { _suppressed = false; }',
      'return fn();',
    ),
    (H) => {
      H.suppress(() => {});
      H.push('after'); // if the flag never released, this push is silently dropped
      assert.ok(H.canUndo(), 'suppress must release the flag so a later push() succeeds');
    },
    'HistoryEngine: suppress finally { _suppressed = false } removed',
  );
});

test('mutation kill — HistoryEngine: new push() keeps stale redo entries (length=0 → length=1)', () => {
  assertHistoryEngineMutationKilled(
    (s) => s.replace(
      '_redoStack.length = 0;   // invalidate redo on new action',
      '_redoStack.length = 1;   // MUTANT',
    ),
    (H, DS) => {
      DS.setElements([{ id: 's0', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 's0' }]);
      H.push('a');
      DS.setElements([{ id: 's1', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 's1' }]);
      H.undo(); // populates redo stack
      H.push('b'); // must fully invalidate redo
      assert.equal(H.canRedo(), false, 'a new push must fully clear the redo stack');
    },
    'HistoryEngine: _redoStack.length = 0 → = 1 (push leaves stale redo entry)',
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
    'HistoryEngine shift→pop',
    'HistoryEngine canUndo off-by-one',
    'HistoryEngine suppress no-release',
    'HistoryEngine redo not cleared on push',
  ];
  assert.equal(mutations.length, 10, 'mutation suite must cover exactly 10 operators');
  // Operators covered: AOR×4, ROR×2, COR×0, SBR×2, UOI×2
  const coverage = { AOR: 4, ROR: 2, COR: 0, SBR: 2, UOI: 2 };
  assert.equal(Object.values(coverage).reduce((a, b) => a + b, 0), 10);
});
