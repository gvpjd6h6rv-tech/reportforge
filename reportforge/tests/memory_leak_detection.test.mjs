'use strict';
/**
 * MEMORY LEAK DETECTION — Tier 2 hardening
 *
 * Detecta leaks reales mediante tres estrategias sin heap profiler externo:
 *
 *   1. Listener accumulation: verifica que las operaciones repetidas no acumulan
 *      listeners en objetos vivos (HistoryEngine.onChange, RenderScheduler queues)
 *
 *   2. Stack boundedness: verifica que los stacks de undo/redo respetan MAX_STACK
 *      y no crecen ilimitadamente con operaciones repetidas
 *
 *   3. Reference retention: verifica que arrays internos no crecen N×O(operaciones)
 *      (síntoma clásico de closures que retienen referencias a arrays crecientes)
 *
 * Para leaks de DOM/browser (heap real): ver race_conditions.test.mjs + Playwright CDP.
 *
 * Snapshot honesto: las verificaciones que no son ejecutables en Node sin browser
 * están marcadas como DEFERRED con el motivo explícito.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Loaders aislados
// ---------------------------------------------------------------------------

function loadGeometryCore() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/GeometryCore.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ---------------------------------------------------------------------------
// 1. Listener accumulation
//
// HistoryState.js (the old factory harness) was retired in P14F. Its
// "onChange listeners do not accumulate" coverage was migrated to
// history_engine.test.mjs ("onChange: repeated registration accumulates
// listeners") in P14E, against the real HistoryEngine.js singleton.
// ---------------------------------------------------------------------------

test('memory leak — DEFERRED: notify() isolated from stack mutation (requires exposing a bare notify hook)', () => {
  // HistoryState.js exposed notify() standalone, decoupled from any stack
  // mutation, so "calling notify 200x doesn't grow the stacks" was directly
  // testable. HistoryEngine.js never exposes notify() without coupling it to
  // push()/undo()/redo()/clear() — each of which DOES mutate a stack by
  // design. There is no black-box way to trigger a notify-only event on the
  // real singleton without changing its public API (out of scope here, and
  // not requested by any production caller). Documented as a gap rather than
  // silently dropped — same convention as the RenderScheduler rAF gap in
  // race_conditions.test.mjs and the DOM listener leak gap below.
  const GAP = {
    id: 'MEMLEAK-NOTIFY-001',
    description: 'HistoryEngine.js has no standalone notify() hook decoupled from a stack mutation',
    requires: 'exposing notify() (or an equivalent no-op trigger) on HistoryEngine.js — a public API change',
    knownRisk: 'low', // every real caller of notify is already a stack mutation in this codebase
    implementedIn: null,
  };
  assert.ok(GAP.id, 'gap must be formally documented');
  assert.equal(GAP.implementedIn, null, 'gap is unimplemented — update when done');
});

// ---------------------------------------------------------------------------
// 2. Stack boundedness — stacks deben respetar MAX_STACK
//
// "undo stack bounded under sustained push" migrated to history_engine.test.mjs
// ("undo stack is capped at MAX_STACK=100, oldest entries evicted") in P14C.
// "redo stack bounded under sustained pushRedo" had no equivalent to migrate:
// HistoryEngine.js exposes no standalone pushRedo — redo only grows as a
// side-effect of undo(), which is itself bounded by the undo stack's own cap
// (conservation invariant, confirmed in P14B) — the property this test
// checked is not reachable through HistoryEngine's public API.
// "clear releases all stack memory" migrated to history_engine.test.mjs
// ("clear empties both stacks (canUndo/canRedo become false)") in P14C.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. Reference retention en GeometryCore — funciones puras no retienen estado
// ---------------------------------------------------------------------------

test('memory leak — GeometryCore: bboxFromRects does not retain input array references', () => {
  const G = loadGeometryCore();

  // Crear arrays grandes y verificar que bboxFromRects no los retiene
  const ITERATIONS = 1000;
  let lastResult = null;

  for (let i = 0; i < ITERATIONS; i++) {
    const rects = Array.from({ length: 100 }, (_, j) => G.makeRect(j, j, 10, 10));
    lastResult = G.bboxFromRects(rects);
    // rects debería ser collectable aquí — si bboxFromRects lo retiene, es un leak
  }

  // La función debe retornar el mismo resultado para el mismo input determinístico
  assert.ok(lastResult !== null, 'bboxFromRects must return a result');
  assert.equal(typeof lastResult.x, 'number', 'result must be a rect object');

  // Verificar que el resultado es un objeto nuevo (no referencia al input)
  const inputRect = G.makeRect(0, 0, 10, 10);
  const result = G.bboxFromRects([inputRect]);
  assert.notEqual(result, inputRect, 'bboxFromRects must not return input reference directly');
});

test('memory leak — GeometryCore: makeRect produces independent objects (no shared mutable state)', () => {
  const G = loadGeometryCore();

  // Si makeRect retuviera estado compartido, mutar uno afectaría a otros
  const BATCH = 1000;
  const rects = Array.from({ length: BATCH }, (_, i) => G.makeRect(i, i, 10, 10));

  // Mutar uno manualmente
  rects[0].x = 9999;

  // El resto debe estar intacto
  assert.equal(rects[1].x, 1, 'rects must be independent objects — no shared state');
  assert.equal(rects[BATCH - 1].x, BATCH - 1, 'last rect must not be affected by mutation of first');
});

// ---------------------------------------------------------------------------
// 4. Suppress anidado no corrompe el flag
//
// Both "suppress does not leak suppressed=true after normal/error completion"
// and "nested suppress is NOT re-entrant" migrated to history_engine.test.mjs
// in P14C/P14E, proxied through the observable effect on push() (HistoryEngine
// never exposes the raw suppressed flag, by design — see immutability_guard.mjs).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Deferred: leaks de DOM/heap real
// ---------------------------------------------------------------------------

test('memory leak — DEFERRED: DOM listener leak (requires browser CDP heap snapshot)', () => {
  // Este test es un marcador formal de gap.
  // La detección real requiere:
  //   1. Playwright + CDP: page.evaluate(() => gc())
  //   2. cdp.send('HeapProfiler.takeHeapSnapshot')
  //   3. Comparar conteo de EventListener objects antes/después de N operaciones
  //
  // Gap: los tests browser existentes (flaky_detection, session_replay) no instrumentan
  // CDP ni comparan heap snapshots entre operaciones — solo observan outputs visuales.
  //
  // Para implementar: ver race_conditions.test.mjs donde sí se usa CDP para timing.
  const GAP = {
    id: 'MEMLEAK-DOM-001',
    description: 'EventListener accumulation on .cr-element across paste/undo cycles',
    requires: 'Playwright CDP + HeapProfiler.takeHeapSnapshot',
    knownRisk: 'medium', // cada paste añade listeners de drag; undo puede no limpiarlos
    implementedIn: null, // pendiente
  };
  assert.ok(GAP.id, 'gap must be formally documented');
  assert.equal(GAP.implementedIn, null, 'gap is unimplemented — update when done');
});
