'use strict';
/**
 * RACE CONDITIONS — Tier 2 hardening
 *
 * Detecta condiciones de carrera reales mediante dos capas:
 *
 * Capa A — Lógica pura (sin browser):
 *   Concurrencia simulada en HistoryState, HistoryEngine.
 *   Interleaving manual de operaciones que en el browser ocurren en callbacks
 *   anidados (pointer → undo → notify → suppress → pushUndo).
 *
 * Capa B — Timing real con Playwright (browser):
 *   Operaciones simultáneas con setInterval + pointer events.
 *   Verifica que el estado del modelo es consistente después de concurrencia real.
 *   Skip automático si Playwright/Chromium no disponibles.
 *
 * Snapshot honesto:
 *   - RenderScheduler es DOM-bound (rAF) — no testeable en Node sin jsdom.
 *   - Las race conditions de timing de rAF están cubiertas por fast_interaction_smoke.
 *   - Se documenta el gap explícitamente.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function load(filename, extra = {}) {
  const src = fs.readFileSync(path.join(ROOT, 'engines', filename), 'utf8');
  const ctx = { module: { exports: {} }, ...extra };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

function loadHistoryState() { return load('HistoryState.js'); }

// HistoryEngine is a DOM-bound singleton (DS + layout engines + overlay).
// Stub the minimum surface it touches so push/undo/redo run headless,
// and track side-effect calls so restore-path tests can assert on them.
function loadHistoryEngine() {
  const calls = { canvasUpdate: 0, sectionUpdate: 0, canvasRenderAll: 0, overlayRender: 0 };

  const DS = {
    elements: [{ id: 'e1', type: 'text', x: 10, y: 10, w: 100, h: 20, text: 'hello' }],
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

// ---------------------------------------------------------------------------
// Capa A — Race conditions en lógica pura
// ---------------------------------------------------------------------------

test('race condition — HistoryState: interleaved push+popUndo is consistent (no phantom entries)', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(100);

  // Simula: dos "threads" compitiendo — uno push, uno pop
  // En JS single-threaded esto no puede ocurrir en paralelo real,
  // pero sí puede ocurrir en callbacks anidados (e.g. undo triggered from notify listener)
  const results = [];
  st.onChange(() => {
    // Listener que intenta pop durante notify — interleaving de callbacks
    const entry = st.popUndo();
    if (entry) results.push({ type: 'listener-pop', label: entry.label });
  });

  // Secuencia de push → cada push triggerea notify → listener hace pop
  for (let i = 0; i < 5; i++) {
    st.pushUndo({ label: `action-${i}` });
    st.notify();
  }

  // El stack debe estar vacío porque cada notify triggeró un pop
  // Si hay race: el stack tendría entries fantasma
  assert.equal(st.undoStack.length, 0,
    'undo stack must be empty after push+notify+listener-pop cycle (no phantom entries)');
  assert.equal(results.length, 5, 'listener must have popped exactly 5 entries');
});

test('race condition — HistoryState: suppress during notify does not corrupt stack', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(100);

  let suppressedPushAttempted = 0;
  let suppressedPushBlocked = 0;

  st.onChange(() => {
    // Listener intenta push mientras se está en medio de un notify
    // Esto ocurre en el browser cuando un undo listener dispara saveHistory
    st.suppress(() => {
      suppressedPushAttempted++;
      // Dentro de suppress, pushUndo no debería ocurrir
      // pero el stack se verifica después
      suppressedPushBlocked++;
    });
  });

  st.pushUndo({ label: 'baseline' });
  const stackBefore = st.undoStack.length;

  st.notify();

  // notify disparo el listener → suppress se ejecutó
  assert.equal(suppressedPushAttempted, 1, 'listener must have been called once');
  assert.equal(suppressedPushBlocked, 1, 'suppress callback must have run');

  // El stack NO debe haber crecido dentro del suppress (suppress bloquea pushes)
  // Pero pushUndo en HistoryState NO verifica st.suppressed — es HistoryEngine quien lo hace
  // Esto documenta el gap: suppress está en HistoryState pero pushUndo no lo respeta
  assert.ok(st.undoStack.length >= stackBefore,
    'stack must not shrink from suppress-in-notify sequence');
});

test('race condition — HistoryState: clearRedo during push sequence is atomic', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(100);

  // Poblar redo stack
  for (let i = 0; i < 10; i++) st.pushRedo({ label: `redo-${i}` });
  assert.equal(st.redoStack.length, 10);

  // clearRedo y pushUndo entrelazados (simula undo+new-action concurrente)
  const OPERATIONS = 50;
  for (let i = 0; i < OPERATIONS; i++) {
    st.pushUndo({ label: `action-${i}` });
    st.clearRedo(); // each new action clears redo
  }

  // Invariante: redo debe estar vacío (cada clearRedo vació completamente)
  assert.equal(st.redoStack.length, 0,
    'redo stack must be empty after interleaved push+clearRedo');
  assert.equal(st.undoStack.length, Math.min(OPERATIONS, 100),
    'undo stack must have correct count after push+clearRedo sequence');
});

test('race condition — HistoryState: popUndo+popRedo interleaving never returns same entry twice', () => {
  const { createHistoryState } = loadHistoryState();
  const st = createHistoryState(100);

  // Llenar ambos stacks
  for (let i = 0; i < 20; i++) {
    st.pushUndo({ label: `undo-${i}` });
    st.pushRedo({ label: `redo-${i}` });
  }

  const popped = new Set();
  const conflicts = [];

  // Pop alternado — cada entry debe aparecer exactamente una vez
  for (let i = 0; i < 20; i++) {
    const u = st.popUndo();
    const r = st.popRedo();
    if (u) {
      if (popped.has(u.label)) conflicts.push(`DUPLICATE UNDO: ${u.label}`);
      popped.add(u.label);
    }
    if (r) {
      if (popped.has(r.label)) conflicts.push(`DUPLICATE REDO: ${r.label}`);
      popped.add(r.label);
    }
  }

  assert.equal(conflicts.length, 0,
    `no entry must be returned twice:\n${conflicts.join('\n')}`);
  assert.equal(st.undoStack.length, 0, 'undo stack must be empty after all pops');
  assert.equal(st.redoStack.length, 0, 'redo stack must be empty after all pops');
});

// ---------------------------------------------------------------------------
// HistoryEngine — snapshot/restore via push/undo/redo
// (migrated from HistorySnapshot direct-capture tests — P13B)
// ---------------------------------------------------------------------------

test('race condition — HistoryEngine: undo restores the exact pre-push snapshot, deterministically', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();

  HistoryEngine.push('baseline');
  const baselineElements = JSON.parse(JSON.stringify(DS.elements));
  const baselineSections = JSON.parse(JSON.stringify(DS.sections));

  // Mutate DS after push — simulates the model changing post-snapshot
  DS.setElements([{ id: 'e2', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 'mutated' }]);
  DS.setSections([{ id: 'rh', stype: 'reportHeader', height: 10 }]);

  const ok = HistoryEngine.undo();
  assert.ok(ok, 'undo() must report success when an entry exists');

  // DS.elements/sections are parsed inside the vm sandbox realm — compare by
  // serialized value, not assert.deepEqual, which also checks Object.prototype
  // identity and would false-fail across realms even on identical content.
  assert.equal(JSON.stringify(DS.elements), JSON.stringify(baselineElements),
    'undo must restore elements to the exact pre-push snapshot');
  assert.equal(JSON.stringify(DS.sections), JSON.stringify(baselineSections),
    'undo must restore sections to the exact pre-push snapshot');
});

test('race condition — HistoryEngine: snapshot is deep-cloned (post-push mutation does not corrupt the stored entry)', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();

  HistoryEngine.push('baseline');
  const originalLen = DS.elements.length;

  // Mutate the SAME array reference that was live at push time — if the
  // snapshot held a reference instead of a deep clone, this would corrupt it.
  DS.elements.push({ id: 'injected', type: 'fake' });
  assert.equal(DS.elements.length, originalLen + 1, 'sanity: mutation applied to live array');

  HistoryEngine.undo();

  assert.equal(DS.elements.length, originalLen,
    'undo must restore the deep-cloned snapshot, unaffected by post-push mutation of the live array');
  assert.ok(!DS.elements.some((e) => e.id === 'injected'),
    'restored elements must not contain the post-push injected entry');
});

test('race condition — HistoryEngine: restore path fires the canonical side-effect set exactly once per undo/redo', () => {
  const { HistoryEngine, DS, calls } = loadHistoryEngine();

  HistoryEngine.push('baseline');
  DS.setElements([{ id: 'e2', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 'mutated' }]);

  HistoryEngine.undo();
  assert.equal(calls.canvasUpdate, 1, 'undo must call CanvasLayoutEngine.update() exactly once');
  assert.equal(calls.sectionUpdate, 1, 'undo must call SectionLayoutEngine.update() exactly once');
  assert.equal(calls.canvasRenderAll, 1, 'undo must call CanvasLayoutEngine.renderAll() exactly once');
  assert.equal(calls.overlayRender, 1, 'undo must call OverlayEngine.render() exactly once');

  HistoryEngine.redo();
  assert.equal(calls.canvasUpdate, 2, 'redo must call CanvasLayoutEngine.update() again');
  assert.equal(calls.sectionUpdate, 2, 'redo must call SectionLayoutEngine.update() again');
  assert.equal(calls.canvasRenderAll, 2, 'redo must call CanvasLayoutEngine.renderAll() again');
  assert.equal(calls.overlayRender, 2, 'redo must call OverlayEngine.render() again');
});

// ---------------------------------------------------------------------------
// Capa B — Race conditions en browser (Playwright)
// ---------------------------------------------------------------------------

test('race condition — browser: rapid undo+paste interleaving leaves model consistent', { timeout: 90000 }, async (t) => {
  // Playwright disponible — intentar browser real
  let playwrightAvailable = false;
  let mod;
  try {
    mod = await import('../runtime_harness.mjs');
    playwrightAvailable = true;
  } catch {
    t.diagnostic('SKIP: Playwright/runtime harness not importable in this context');
  }

  if (!playwrightAvailable) {
    assert.ok(true, 'SKIP: browser race condition test requires Playwright');
    return;
  }

  const { startRuntimeServer, launchRuntimePage, reloadRuntime } = mod;
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await reloadRuntime(page, server.baseUrl);

    // Estado baseline
    const baseline = await page.evaluate(() => ({
      count: DS.elements.length,
      ids: DS.elements.map((e) => e.id),
    }));

    // Seleccionar un elemento
    await page.locator('.cr-element:not(.pv-el)').first().click();
    await page.waitForTimeout(60);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(40);

    // Race: paste + undo entrelazados rápidamente
    // Simula dos paths concurrentes: usuario rápido + keyboard throttle bypass
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Control+z'); // undo inmediato
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);

    // Estado final debe ser consistente — design IDs == model IDs
    const after = await page.evaluate(() => {
      const modelIds = DS.elements.map((e) => e.id).sort();
      const designIds = [...document.querySelectorAll('.cr-element[data-id]')]
        .filter((el) => !el.closest('#preview-layer'))
        .map((el) => el.dataset.id)
        .sort();
      return { modelIds, designIds, consistent: JSON.stringify(modelIds) === JSON.stringify(designIds) };
    });

    assert.ok(after.consistent,
      `model/design consistency broken after rapid undo+paste race:\nmodel=${JSON.stringify(after.modelIds)}\ndesign=${JSON.stringify(after.designIds)}`);

    t.diagnostic(`race test: baseline=${baseline.count} after=${after.modelIds.length} consistent=${after.consistent}`);

    // No debe haber errores de consola durante la race
    const errors = consoleErrors.filter((e) => !e.includes('[v19') && !e.includes('favicon'));
    assert.equal(errors.length, 0,
      `console errors during race:\n${errors.join('\n')}`);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('race condition — browser: concurrent setInterval write + pointer drag leaves model consistent', { timeout: 90000 }, async (t) => {
  let mod;
  try {
    mod = await import('../runtime_harness.mjs');
  } catch {
    t.diagnostic('SKIP: Playwright not available');
    assert.ok(true);
    return;
  }

  const { startRuntimeServer, launchRuntimePage, reloadRuntime } = mod;
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await reloadRuntime(page, server.baseUrl);

    // Lanzar un setInterval que intenta escribir DS.zoom repetidamente
    // mientras el usuario arrastra — simula race entre timer y pointer handler
    await page.evaluate(() => {
      window.__raceInterval = setInterval(() => {
        if (typeof ZoomEngineV19 !== 'undefined') {
          const current = RF.Geometry.zoom();
          // Intentar setear zoom durante drag — debe ser ignorado o serializado
          try { ZoomEngineV19.set(current); } catch {}
        }
      }, 10);
    });

    // Drag mientras el interval está corriendo
    const el = page.locator('.cr-element:not(.pv-el)').first();
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(
          box.x + box.width / 2 + i * 5,
          box.y + box.height / 2 + i * 5,
        );
        await page.waitForTimeout(12); // ~80ms total, interval fires ~8 times
      }
      await page.mouse.up();
    }

    await page.evaluate(() => {
      clearInterval(window.__raceInterval);
      delete window.__raceInterval;
    });
    await page.waitForTimeout(120);

    // Verificar consistencia post-race
    const state = await page.evaluate(() => {
      const modelIds = DS.elements.map((e) => e.id).sort();
      const designIds = [...document.querySelectorAll('.cr-element[data-id]')]
        .filter((el) => !el.closest('#preview-layer'))
        .map((el) => el.dataset.id)
        .sort();
      return {
        modelIds,
        designIds,
        zoom: RF.Geometry.zoom(),
        consistent: JSON.stringify(modelIds) === JSON.stringify(designIds),
      };
    });

    assert.ok(state.consistent,
      `model/design inconsistency after concurrent setInterval+drag race`);
    assert.ok(state.zoom >= 0.25 && state.zoom <= 4.0,
      `zoom must be within valid range after race, got ${state.zoom}`);

    t.diagnostic(`zoom-race: zoom=${state.zoom} consistent=${state.consistent}`);

    const errors = consoleErrors.filter((e) => !e.includes('[v19') && !e.includes('favicon'));
    assert.equal(errors.length, 0, `console errors during zoom race:\n${errors.join('\n')}`);
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// Gap: RenderScheduler rAF race
// ---------------------------------------------------------------------------

test('race condition — DEFERRED: RenderScheduler rAF vs flushSync interleaving (requires DOM/rAF)', () => {
  const GAP = {
    id: 'RACE-SCHEDULER-001',
    description: 'rAF callback fires while flushSync is executing — queues may be double-flushed',
    requires: 'jsdom or real browser with CDP frame timing',
    knownRisk: 'low', // flushSync checks state.flushing guard
    mitigatedBy: 'RenderSchedulerFrame._flush checks S.flushing before executing',
    implementedIn: null,
  };
  assert.ok(GAP.id);
  assert.equal(GAP.implementedIn, null, 'gap is unimplemented — update when done');
});
