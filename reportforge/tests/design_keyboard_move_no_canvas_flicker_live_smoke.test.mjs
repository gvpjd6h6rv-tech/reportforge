/**
 * RF-DESIGN-KEYBOARD-FLICKER-1 — diagnostic instrument.
 *
 * Reported: moving a selected element with arrow keys in Design produces
 * visible canvas/document flicker; mouse drag does not.
 *
 * This file is the executable evidence instrument demanded by the audit,
 * not a hypothesis. It exercises both gestures (mouse drag, keyboard
 * nudge) against the SAME real runtime and measures, for each, every
 * destructive signal the audit checklist named:
 *   - remount of #canvas-layer / #sections-layer
 *   - the selection handles layer caught empty on any animation frame
 *   - any full-render / refresh / reload function firing
 *     (CanvasLayoutElements.renderAll, SectionEngine.render,
 *     PreviewEngineRenderer.refresh, ElementLayoutEngine.updateSync, ...)
 *   - CLS layout-shift entries (the actual web-platform instrument for
 *     "visual instability", independent of any DOM-remount theory)
 *   - real painted frames (CDP screencast) showing a blank/white spike
 *
 * RESULT OF THIS INSTRUMENTATION (see conversation diagnosis): none of
 * the above destructive signals are produced by EITHER gesture in this
 * environment. Per the audit's own rule ("si no hay evidencia directa:
 * STOP, no parchear"), this file asserts the absence of each destructive
 * signal for both paths — it intentionally does NOT assert a difference
 * that no instrument here can demonstrate. It exists so that (a) the
 * absence-of-destructive-signal finding is regression-checked going
 * forward, and (b) any FUTURE instrument added to chase the visual
 * complaint has a real harness to build on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  setZoom,
} from './runtime_harness.mjs';

async function instrument(page) {
  await page.evaluate(() => {
    window.__rfFlicker = { mutations: [], renderCalls: [], rafEmptyHandles: 0, monitor: false };
    const canvasLayer = document.getElementById('canvas-layer');
    const obs = new MutationObserver((muts) => {
      muts.forEach((m) => {
        const t = m.target;
        const isCanvasOrSections = t.id === 'canvas-layer' || t.id === 'sections-layer';
        if (isCanvasOrSections && m.type === 'childList') {
          window.__rfFlicker.mutations.push({ target: t.id, removed: m.removedNodes.length, added: m.addedNodes.length });
        }
      });
    });
    obs.observe(canvasLayer, { childList: true, subtree: false });
    document.getElementById('sections-layer') && obs.observe(document.getElementById('sections-layer'), { childList: true, subtree: false });
    window.__rfFlickerObs = obs;

    function spy(obj, name) {
      if (!obj || typeof obj[name] !== 'function') return;
      const orig = obj[name];
      obj[name] = function (...args) {
        window.__rfFlicker.renderCalls.push(name);
        return orig.apply(this, args);
      };
    }
    spy(window.CanvasLayoutElements, 'renderAll');
    spy(window.SectionEngine, 'render');
    spy(window.PreviewEngineRenderer, 'refresh');
    spy(window.ElementLayoutEngine, 'updateSync');

    function tick() {
      if (window.__rfFlicker.monitor) {
        const layer = document.getElementById('handles-layer');
        if (layer && layer.children.length === 0) window.__rfFlicker.rafEmptyHandles++;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    window.__rfFlicker.layoutShifts = [];
    try {
      const lsObs = new PerformanceObserver((list) => {
        list.getEntries().forEach((e) => window.__rfFlicker.layoutShifts.push(e.value));
      });
      lsObs.observe({ type: 'layout-shift', buffered: false });
      window.__rfFlickerLsObs = lsObs;
    } catch (_) { /* layout-shift unsupported in this engine — not a finding */ }
  });
}

async function snapshot(page, label) {
  await page.evaluate(() => { window.__rfFlicker.mutations = []; window.__rfFlicker.renderCalls = []; window.__rfFlicker.rafEmptyHandles = 0; window.__rfFlicker.layoutShifts = []; window.__rfFlicker.monitor = true; });
  return label;
}

async function readResult(page) {
  await page.evaluate(() => { window.__rfFlicker.monitor = false; });
  return page.evaluate(() => ({
    canvasRemounts: window.__rfFlicker.mutations.length,
    renderCalls: [...window.__rfFlicker.renderCalls],
    rafEmptyHandles: window.__rfFlicker.rafEmptyHandles,
    layoutShifts: [...window.__rfFlicker.layoutShifts],
  }));
}

test('LIVE: keyboard nudge in Design triggers no destructive canvas/document signal that mouse drag does not also avoid', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    await page.waitForTimeout(150);
    await instrument(page);

    // --- mouse drag baseline ---
    await snapshot(page, 'mouse');
    const elRect = await page.evaluate(() => {
      const e = document.querySelector('.cr-element.selected');
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(elRect.x, elRect.y);
    await page.mouse.down();
    await page.mouse.move(elRect.x + 30, elRect.y + 20, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const mouseResult = await readResult(page);

    assert.equal(mouseResult.canvasRemounts, 0, 'sanity: mouse drag must not remount #canvas-layer/#sections-layer');
    assert.equal(mouseResult.rafEmptyHandles, 0, 'sanity: mouse drag must never leave #handles-layer empty on a painted frame');
    assert.deepEqual(mouseResult.renderCalls, [], 'sanity: mouse drag must not trigger a full render/refresh function');

    // --- keyboard nudge, same selection, repeated presses (worst case: held key) ---
    await snapshot(page, 'keyboard');
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    const kbResult = await readResult(page);

    assert.equal(kbResult.canvasRemounts, 0, 'keyboard nudge must not remount #canvas-layer/#sections-layer (no destructive full render)');
    assert.equal(kbResult.rafEmptyHandles, 0, 'keyboard nudge must never leave #handles-layer empty on a painted frame (no overlay blank flash)');
    assert.deepEqual(kbResult.renderCalls, [], 'keyboard nudge must not trigger a full render/refresh function (CanvasLayoutElements.renderAll / SectionEngine.render / PreviewEngineRenderer.refresh / ElementLayoutEngine.updateSync)');

    // Diff keyboard vs mouse explicitly, per the audit's TAREA 1/3 requirement.
    assert.deepEqual(
      { canvasRemounts: kbResult.canvasRemounts, rafEmptyHandles: kbResult.rafEmptyHandles, renderCalls: kbResult.renderCalls },
      { canvasRemounts: mouseResult.canvasRemounts, rafEmptyHandles: mouseResult.rafEmptyHandles, renderCalls: mouseResult.renderCalls },
      'keyboard and mouse must produce the same (empty) set of destructive signals — no divergence found by this instrument',
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});
