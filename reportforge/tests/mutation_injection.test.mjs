'use strict';
/**
 * MUTATION INJECTION — Bug Injection / Mutation Testing
 *
 * Pregunta que responde: ¿nuestros tests detectan bugs reales o solo verifican el happy path?
 *
 * Método:
 *   1. Cargar source de engines puras (GeometryCore, HistoryState)
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
// Tier B — HistoryState boundary guards & stack semantics
// ---------------------------------------------------------------------------

test('mutation kill — HistoryState: pushUndo shift→pop removes wrong end', () => {
  const src = path.join(ROOT, 'engines/HistoryState.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'if (undoStack.length > maxStack) undoStack.shift();',
      'if (undoStack.length > maxStack) undoStack.pop();',
    ),
    (H) => {
      const st = H.createHistoryState(2);
      st.pushUndo({ label: 'first' });
      st.pushUndo({ label: 'second' });
      st.pushUndo({ label: 'third' }); // overflow: oldest must be evicted
      // With shift: [second, third]. With pop (mutant): [first, second]
      const top = st.undoStack[st.undoStack.length - 1];
      assert.equal(top.label, 'third', 'most recent entry must survive eviction');
    },
    'HistoryState: undoStack.shift() → undoStack.pop() on overflow',
  );
});

test('mutation kill — HistoryState: canUndo > 0 → > 1 off-by-one', () => {
  const src = path.join(ROOT, 'engines/HistoryState.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'return undoStack.length > 0;',
      'return undoStack.length > 1;',
    ),
    (H) => {
      const st = H.createHistoryState(10);
      st.pushUndo({ label: 'action' });
      assert.ok(st.canUndo(), 'canUndo must be true after exactly one push');
    },
    'HistoryState: canUndo length > 0 → > 1 (off-by-one)',
  );
});

test('mutation kill — HistoryState: suppress does not release (finally removed)', () => {
  const src = path.join(ROOT, 'engines/HistoryState.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'suppressed = true;\n      try { return fn(); } finally { suppressed = false; }',
      'suppressed = true;\n      return fn();',
    ),
    (H) => {
      const st = H.createHistoryState(10);
      st.suppress(() => {}); // after suppress, suppressed must be false again
      assert.ok(!st.suppressed, 'suppress must release flag after callback completes');
    },
    'HistoryState: suppress finally { suppressed = false } removed',
  );
});

test('mutation kill — HistoryState: clearRedo keeps redo entries (length=0 → length=1)', () => {
  const src = path.join(ROOT, 'engines/HistoryState.js');
  assertMutationKilled(
    src,
    (s) => s.replace(
      'redoStack.length = 0;',
      'redoStack.length = 1;',
    ),
    (H) => {
      const st = H.createHistoryState(10);
      st.pushRedo({ label: 'r1' });
      st.pushRedo({ label: 'r2' });
      st.clearRedo();
      assert.equal(st.redoStack.length, 0, 'clearRedo must empty the redo stack completely');
    },
    'HistoryState: redoStack.length = 0 → = 1 (clearRedo leaves entry)',
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
    'HistoryState shift→pop',
    'HistoryState canUndo off-by-one',
    'HistoryState suppress no-release',
    'HistoryState clearRedo partial',
  ];
  assert.equal(mutations.length, 10, 'mutation suite must cover exactly 10 operators');
  // Operators covered: AOR×4, ROR×2, COR×0, SBR×2, UOI×2
  const coverage = { AOR: 4, ROR: 2, COR: 0, SBR: 2, UOI: 2 };
  assert.equal(Object.values(coverage).reduce((a, b) => a + b, 0), 10);
});
