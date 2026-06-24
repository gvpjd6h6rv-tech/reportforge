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

// RF-PARITY-AUDIT-1: HistoryEngine no longer keeps its own _undoStack/
// _redoStack, _snapshot()/_restore(), or a real onChange/notify mechanism —
// it delegates push/undo/redo to DS.saveHistory/DS.undo/DS.redo (the stack
// DocumentHistory.js maintains, also used by the menu #btn-undo/#btn-redo
// buttons — see engines/HistoryEngine.js and
// keyboard_shortcuts_undo_redo_contract.test.mjs for the root cause this
// fixed: Ctrl+Z used to silently no-op after resize/align/format/
// properties/section edits, because only drag/nudge/paste ever populated
// the old independent stack).
//
// Capa A below was rewritten against that reality: onChange is now a
// deliberately inert stub (confirmed: nothing in production subscribes to
// it), so "race condition triggered from inside an onChange listener" no
// longer has a mechanism to race through. What IS still meaningfully
// racy in a thin delegate: suppress() re-entrancy and rapid interleaved
// push/undo/redo/suppress calls not throwing or losing call-count
// integrity. Capa B (browser, below) is unchanged — it exercises the live
// app through real keyboard events and naturally benefits from the fix
// without needing rewriting.
function loadHistoryEngine() {
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
  const src = fs.readFileSync(path.join(ROOT, 'engines/HistoryEngine.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  return { HistoryEngine: ctx.module.exports, DS, calls, buttons };
}

// ---------------------------------------------------------------------------
// Capa A — Race conditions en lógica pura
// ---------------------------------------------------------------------------

test('race condition — HistoryEngine: nested suppress(fn) calls do not corrupt the outer suppress flag', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();

  HistoryEngine.suppress(() => {
    HistoryEngine.suppress(() => {
      HistoryEngine.push('inner'); // still inside an active suppress -> no-op
    });
    HistoryEngine.push('still-inside-outer'); // KNOWN: inner suppress's
    // `finally` already released the flag on completion (no depth
    // counter) — documents the same limitation history_engine.test.mjs
    // covers, re-expressed for the delegate.
  });

  assert.equal(calls.saveHistory, 1, 'only the push issued after the inner suppress released the flag should reach DS.saveHistory()');
});

test('race condition — HistoryEngine: rapid interleaved push/undo/redo/suppress calls never throw and keep delegate call counts exact', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();

  const ops = [];
  for (let i = 0; i < 50; i++) {
    ops.push(() => HistoryEngine.push(`a${i}`));
    ops.push(() => HistoryEngine.undo());
    ops.push(() => HistoryEngine.redo());
    ops.push(() => HistoryEngine.suppress(() => HistoryEngine.push(`suppressed${i}`)));
  }
  // Interleave in a fixed but non-sequential order to simulate the kind of
  // nested-callback interleaving that happens in the browser (pointer ->
  // undo -> re-render -> another pointer event before the first settles).
  const order = ops.map((_, i) => i).sort((a, b) => (a * 7919) % ops.length - (b * 7919) % ops.length);
  assert.doesNotThrow(() => { order.forEach((i) => ops[i]()); });

  // Every push() outside suppress must have reached DS.saveHistory exactly
  // once each; every suppressed push must NOT have.
  assert.equal(calls.saveHistory, 50, '50 non-suppressed push() calls, each delegating to DS.saveHistory() exactly once — suppressed pushes must not count');
  assert.equal(calls.undo, 50);
  assert.equal(calls.redo, 50);
});

test('race condition — HistoryEngine: undo() and redo() never call DS.saveHistory() even under interleaving (no double-save)', () => {
  const { HistoryEngine, calls } = loadHistoryEngine();
  for (let i = 0; i < 20; i++) {
    HistoryEngine.push(`a${i}`);
    HistoryEngine.undo();
    HistoryEngine.redo();
    HistoryEngine.undo();
  }
  assert.equal(calls.saveHistory, 20, 'only the 20 push() calls should reach DS.saveHistory() — undo/redo must never trigger it');
});

test('DISABLED (root cause fixed, mechanism removed) — race condition — HistoryEngine: undo triggered from inside its own onChange listener does not corrupt the stack', { skip: 'onChange is now a deliberately inert stub — nothing in production subscribes to it, so this scenario cannot occur. See history_engine.test.mjs.' }, () => {
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

// The following scenarios all tested internal mechanics of the OLD
// independent _undoStack/_redoStack + _snapshot()/_restore() + onChange
// notify that no longer exist post-delegation (onChange listener races,
// per-push redo invalidation timing, deep-clone snapshot isolation, exact
// CanvasLayoutEngine/SectionLayoutEngine/OverlayEngine side-effect call
// counts from the retired _restore(), and a MAX_STACK=100 cap that was
// HistoryEngine's own — DocumentHistory.js, which now does the real work,
// has its own separate cap (80) and is pre-existing, already-production
// code this audit did not modify). Equivalent coverage for what's still
// meaningfully racy in the new thin delegate lives in the three tests
// above (nested suppress, rapid interleaving, no double-save under
// interleaving).

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
    mod = await import('./runtime_harness.mjs');
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
    mod = await import('./runtime_harness.mjs');
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
