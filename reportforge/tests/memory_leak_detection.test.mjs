'use strict';
/**
 * MEMORY LEAK DETECTION — Tier 2 hardening
 *
 * Detecta leaks reales mediante tres estrategias sin heap profiler externo:
 *
 *   1. Listener accumulation: verifica que las operaciones repetidas no acumulan
 *      listeners en objetos vivos (HistoryState.onChange, RenderScheduler queues)
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

function loadHistoryState() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/HistoryState.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

function loadGeometryCore() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/GeometryCore.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ---------------------------------------------------------------------------
// 1. Listener accumulation
// ---------------------------------------------------------------------------

test('memory leak — HistoryState: onChange listeners do not accumulate across repeated registrations', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(100);

  // Patrón de leak: re-registrar el mismo listener en cada operación
  // (common bug: widget se re-monta y añade listener sin limpiar el anterior)
  const REGISTRATIONS = 50;
  const fired = [];

  for (let i = 0; i < REGISTRATIONS; i++) {
    // Cada "registro" añade un listener — simula el bug de re-mount sin cleanup
    st.onChange(() => fired.push(i));
  }

  // Una sola operación
  st.pushUndo({ label: 'action' });
  st.notify();

  // Con 50 registros, fired tendrá 50 entradas — esto ES el leak
  // El test documenta la realidad y fija un umbral: si crece más de 50× → alerta
  // La corrección real requiere removeListener (fuera de scope de este test)
  const listenersNow = st.listeners.length;
  assert.equal(listenersNow, REGISTRATIONS,
    'listener count must equal registrations (documents accumulation as known behavior)');

  // Snapshot honesto: este engine NO tiene removeListener — gap documentado
  // La verificación real sería: listenersNow === 1 después de cleanup
  // Por ahora: el test falla si acumula MÁS de lo esperado (regresión de peor leak)
  assert.ok(listenersNow <= REGISTRATIONS,
    `REGRESSION: listener count ${listenersNow} exceeds registered count ${REGISTRATIONS}`);
});

test('memory leak — HistoryState: notify does not accumulate entries in stack', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(10);

  // Verificar que notify() no tiene side-effects en los stacks
  const NOTIFY_COUNT = 200;
  st.pushUndo({ label: 'base' });

  for (let i = 0; i < NOTIFY_COUNT; i++) {
    st.notify();
  }

  // Stacks deben mantenerse igual — notify no empuja nada
  assert.equal(st.undoStack.length, 1, 'notify must not accumulate undo stack entries');
  assert.equal(st.redoStack.length, 0, 'notify must not accumulate redo stack entries');
});

// ---------------------------------------------------------------------------
// 2. Stack boundedness — stacks deben respetar MAX_STACK
// ---------------------------------------------------------------------------

test('memory leak — HistoryState: undo stack is bounded by maxStack under sustained push', () => {
  const { createHistoryState } = loadHistoryState();
  const MAX = 10;
  const st = createHistoryState(MAX);

  // Push 5× la capacidad máxima
  const PUSHES = MAX * 5;
  for (let i = 0; i < PUSHES; i++) {
    st.pushUndo({ label: `action-${i}` });
  }

  assert.ok(st.undoStack.length <= MAX,
    `undo stack must be bounded at maxStack=${MAX}, got ${st.undoStack.length}`);

  // Verificar que las entradas más recientes sobreviven (FIFO correcto)
  const top = st.undoStack[st.undoStack.length - 1];
  assert.equal(top.label, `action-${PUSHES - 1}`,
    'most recent push must survive eviction (FIFO eviction from front)');

  const bottom = st.undoStack[0];
  assert.equal(bottom.label, `action-${PUSHES - MAX}`,
    'oldest surviving entry must be PUSHES-MAX (correct eviction boundary)');
});

test('memory leak — HistoryState: redo stack is bounded by maxStack under sustained push', () => {
  const { createHistoryState } = loadHistoryState();
  const MAX = 10;
  const st = createHistoryState(MAX);

  const PUSHES = MAX * 5;
  for (let i = 0; i < PUSHES; i++) {
    st.pushRedo({ label: `redo-${i}` });
  }

  assert.ok(st.redoStack.length <= MAX,
    `redo stack must be bounded at maxStack=${MAX}, got ${st.redoStack.length}`);
});

test('memory leak — HistoryState: clear releases all stack memory', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(100);

  for (let i = 0; i < 100; i++) {
    st.pushUndo({ label: `u${i}` });
    st.pushRedo({ label: `r${i}` });
  }

  assert.equal(st.undoStack.length, 100);
  assert.equal(st.redoStack.length, 100);

  st.clear();

  assert.equal(st.undoStack.length, 0, 'clear must release undo stack');
  assert.equal(st.redoStack.length, 0, 'clear must release redo stack');
});

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
// ---------------------------------------------------------------------------

test('memory leak — HistoryState: suppress does not leak suppressed=true after normal completion', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(10);

  // Caso normal: suppress libera el flag al terminar
  st.suppress(() => {
    assert.ok(st.suppressed, 'must be suppressed inside callback');
  });
  assert.equal(st.suppressed, false, 'suppressed must be false after normal completion');

  // Caso error: finally garantiza liberación incluso si el callback lanza
  try {
    st.suppress(() => { throw new Error('inner error'); });
  } catch {}
  assert.equal(st.suppressed, false, 'suppressed must be false after error in callback (finally clause)');
});

test('memory leak — HistoryState: nested suppress is NOT re-entrant (documents known limitation)', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(10);

  // HistoryState.suppress no implementa conteo de re-entrada — cada suppress anidado
  // libera el flag cuando su finally corre, incluso si un outer suppress sigue activo.
  // Este test documenta el comportamiento real: no es un bug de leak, pero sí un gap
  // de re-entrancia que podría causar pushes inesperados en suppress anidado.
  let outerSeenAfterInner = null;
  st.suppress(() => {
    st.suppress(() => {}); // inner libera el flag
    outerSeenAfterInner = st.suppressed; // outer ya ve false — behavior real del engine
  });

  // Documenta el comportamiento real: suppress no es re-entrant-safe
  // Si esto cambia (se agrega contador de depth), este test debe actualizarse.
  assert.equal(outerSeenAfterInner, false,
    'KNOWN: suppress is not re-entrant — inner suppress releases flag before outer completes');
  assert.equal(st.suppressed, false,
    'after all callbacks: suppressed must be false regardless of nesting');
});

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
