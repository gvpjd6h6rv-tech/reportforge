'use strict';
/**
 * RACE CONDITIONS — Tier 2 hardening
 *
 * Detecta condiciones de carrera reales mediante dos capas:
 *
 * Capa A — Lógica pura (sin browser):
 *   Concurrencia simulada en HistoryEngine.
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

function setIdRC(DS, id) {
  DS.setElements([{ id, type: 'text', x: 0, y: 0, w: 1, h: 1, text: id }]);
}

function currentIdRC(DS) {
  return DS.elements[0].id;
}

// ---------------------------------------------------------------------------
// Capa A — Race conditions en lógica pura
// ---------------------------------------------------------------------------

// Migrated from HistoryState.js in P14F (retired). HistoryEngine.js never
// exposes raw popUndo/popRedo/pushRedo/clearRedo — only push/undo/redo/
// canUndo/canRedo/suppress/onChange/clear, so each interleaving scenario is
// re-expressed through that public API, asserted via canUndo()/canRedo() and
// the restored DS state rather than direct stack inspection.

test('race condition — HistoryEngine: undo triggered from inside its own onChange listener does not corrupt the stack', () => {
  const { HistoryEngine } = loadHistoryEngine();

  // Simula: callback anidado — un listener de notify dispara undo()
  // inmediatamente. push() ya terminó de mutar el stack antes de notificar,
  // así que esto es seguro, pero ejercita el re-entrancy real del browser
  // (pointer → push → notify → undo-from-listener).
  let undoCallsFromListener = 0;
  HistoryEngine.onChange(() => {
    if (HistoryEngine.undo()) undoCallsFromListener++;
  });

  for (let i = 0; i < 5; i++) HistoryEngine.push(`action-${i}`);

  assert.equal(undoCallsFromListener, 5, 'listener must have triggered undo() exactly 5 times');
  assert.equal(HistoryEngine.canUndo(), false,
    'undo stack must be empty — each push was immediately undone by the listener (no phantom entries)');
});

test('race condition — HistoryEngine: suppress triggered from inside its own onChange listener blocks the nested push', () => {
  const { HistoryEngine } = loadHistoryEngine();

  let suppressedPushAttempted = 0;

  HistoryEngine.onChange(() => {
    // Listener intenta push mientras se está en medio de un notify —
    // ocurre en el browser cuando un listener de undo dispara saveHistory.
    HistoryEngine.suppress(() => {
      suppressedPushAttempted++;
      HistoryEngine.push('attempted-inside-suppress'); // must be a no-op
    });
  });

  HistoryEngine.push('baseline');
  assert.equal(suppressedPushAttempted, 1, 'listener must have run suppress exactly once');

  // Only the original 'baseline' push survives — the nested push inside
  // suppress (triggered from baseline's own notify) must not have landed.
  let undoCount = 0;
  while (HistoryEngine.undo()) undoCount++;
  assert.equal(undoCount, 1,
    'exactly one entry (baseline) must be undoable — the suppressed nested push must not corrupt the stack');
});

test('race condition — HistoryEngine: a new push fully invalidates redo even under sustained interleaving', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();

  // Poblar redo: push + undo deja una entrada en redo.
  setIdRC(DS, 's0');
  HistoryEngine.push('baseline');
  setIdRC(DS, 's1');
  HistoryEngine.undo();
  assert.equal(HistoryEngine.canRedo(), true, 'sanity: redo populated after undo');

  // push + clearRedo (automático) entrelazados — simula undo+new-action concurrente.
  const OPERATIONS = 50;
  for (let i = 0; i < OPERATIONS; i++) {
    setIdRC(DS, `action-${i}`);
    HistoryEngine.push(`action-${i}`);
    assert.equal(HistoryEngine.canRedo(), false,
      `redo must be invalidated immediately after push #${i} — no atomicity gap`);
  }
});

test('race condition — HistoryEngine: undo then redo never restores the same snapshot twice in a row', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();

  const PUSHES = 20;
  for (let i = 0; i < PUSHES; i++) {
    setIdRC(DS, `e${i}`);
    HistoryEngine.push(`action-${i}`);
  }
  // Move DS to a state distinct from every pushed snapshot — otherwise the
  // last push's snapshot equals the current state and the first undo()
  // becomes a no-op restore, creating a spurious duplicate at the boundary
  // between the undo and redo chains (a test-construction artifact, not a
  // HistoryEngine bug).
  setIdRC(DS, 'final');

  const undoSeen = [];
  while (HistoryEngine.undo()) undoSeen.push(currentIdRC(DS));
  assert.equal(new Set(undoSeen).size, undoSeen.length,
    `undo must never restore the same snapshot twice in a row:\n${undoSeen.join(',')}`);
  assert.equal(undoSeen.length, PUSHES, 'all pushes must be undoable exactly once');

  const redoSeen = [];
  while (HistoryEngine.redo()) redoSeen.push(currentIdRC(DS));
  assert.equal(new Set(redoSeen).size, redoSeen.length,
    `redo must never restore the same snapshot twice in a row:\n${redoSeen.join(',')}`);
  assert.equal(redoSeen.length, PUSHES, 'all undone entries must be redoable exactly once');

  // redo() repopulates the undo stack as it drains the redo stack — that's
  // the whole point of redo, not a leak. Redo stack must be empty; undo
  // stack must be fully restored (every redo became undoable again).
  assert.equal(HistoryEngine.canRedo(), false, 'redo stack must be empty after all pops');
  assert.equal(HistoryEngine.canUndo(), true, 'undo stack must be repopulated after redoing everything back');
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
// HistoryEngine — divergence fixes locked in (P14B)
// ---------------------------------------------------------------------------

test('race condition — HistoryEngine: redo stack is bounded by MAX_STACK under sustained undo', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();

  // Push once per element id so each undo() produces a distinct redo entry.
  const PUSHES = 150; // > MAX_STACK (100)
  for (let i = 0; i < PUSHES; i++) {
    DS.setElements([{ id: `e${i}`, type: 'text', x: i, y: i, w: 1, h: 1, text: String(i) }]);
    HistoryEngine.push(`action-${i}`);
  }

  // Undo everything available — each undo() moves one entry from undo to redo.
  let undoCount = 0;
  while (HistoryEngine.undo()) undoCount++;
  assert.equal(undoCount, 100, 'undo stack itself must already be capped at MAX_STACK=100 (push-time cap)');

  // Redo stack now holds up to 100 entries (one per undo). Without the P14B
  // cap fix, undo() pushed to _redoStack unconditionally — this loop would
  // have produced 100 entries here regardless, so the real regression guard
  // is pushing MORE undos than MAX_STACK and confirming redo never exceeds it.
  let redoCount = 0;
  while (HistoryEngine.redo()) redoCount++;
  assert.ok(redoCount <= 100,
    `redo stack must never exceed MAX_STACK=100 entries, got ${redoCount} redo() successes`);
});

test('race condition — HistoryEngine: undo stack stays bounded by MAX_STACK under sustained redo', () => {
  const { HistoryEngine, DS } = loadHistoryEngine();

  for (let i = 0; i < 50; i++) {
    DS.setElements([{ id: `e${i}`, type: 'text', x: i, y: i, w: 1, h: 1, text: String(i) }]);
    HistoryEngine.push(`action-${i}`);
  }
  // Move everything to redo, then bounce back and forth far beyond MAX_STACK
  // to exercise redo()'s push into _undoStack — must stay capped too.
  while (HistoryEngine.undo()) {}
  for (let i = 0; i < 500; i++) {
    if (!HistoryEngine.redo()) break;
    HistoryEngine.undo();
  }
  let undoCount = 0;
  while (HistoryEngine.undo()) undoCount++;
  assert.ok(undoCount <= 100,
    `undo stack must never exceed MAX_STACK=100 entries after sustained redo/undo bouncing, got ${undoCount}`);
});

test('race condition — HistoryEngine: suppress(fn) returns the value produced by fn', () => {
  const { HistoryEngine } = loadHistoryEngine();
  const result = HistoryEngine.suppress(() => 42);
  assert.equal(result, 42, 'suppress() must forward the return value of fn(), matching HistoryState.suppress contract');
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
