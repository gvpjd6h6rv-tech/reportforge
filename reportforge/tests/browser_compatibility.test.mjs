'use strict';
/**
 * BROWSER COMPATIBILITY — Tier 2 hardening
 *
 * Objetivo: detectar bugs específicos de browser que solo aparecen en Firefox/WebKit.
 * Los tests user_parity existentes corren solo en Chromium.
 *
 * Estrategia:
 *   1. Smoke tests multi-browser: layout, DS, engine init — verifican que el runtime
 *      arranca y es funcional en los 3 browsers disponibles.
 *   2. API surface cross-browser: querySelector, dataset, classList, getBoundingClientRect —
 *      funciones que históricamente difieren entre browsers.
 *   3. CSS rendering smoke: verifica que los elementos tienen dimensiones > 0
 *      (detecta box-model bugs específicos de browser).
 *   4. JS API compatibility: verifica que las APIs usadas por engines existen y funcionan
 *      (matchAll, structuredClone, queueMicrotask, requestAnimationFrame).
 *
 * Snapshot honesto:
 *   - Visual pixel-perfect goldens son costosos en CI — no se hacen aquí.
 *     Ver visual_golden_user_parity.test.mjs para eso.
 *   - Webkit headless tiene limitaciones con pointer events — se documenta.
 *   - Los tests que fallan en webkit por limitaciones conocidas se marcan como
 *     expected failures, no como bugs nuevos.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  getBrowserAvailability,
  reloadRuntime,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// ---------------------------------------------------------------------------
// Helper: run a block across all available browsers, skip unavailable ones
// ---------------------------------------------------------------------------

async function forEachBrowser(t, fn) {
  const availability = await getBrowserAvailability();
  const available = Object.entries(availability)
    .filter(([, info]) => info.available)
    .map(([name]) => name);

  assert.ok(available.length >= 1, 'at least one browser must be available');

  for (const browserName of available) {
    await t.test(`browser:${browserName}`, async (t) => {
      await fn(t, browserName);
    });
  }
}

// ---------------------------------------------------------------------------
// 1. Runtime smoke — DS, engines, and element rendering across all browsers
// ---------------------------------------------------------------------------

test('browser compatibility — runtime initializes with DS and elements in all browsers', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    await forEachBrowser(t, async (t, browserName) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
      try {
        // DS must exist and have elements
        const dsState = await page.evaluate(() => ({
          hasDS: typeof DS !== 'undefined',
          elementCount: typeof DS !== 'undefined' ? DS.elements.length : 0,
          hasSections: typeof DS !== 'undefined' && Array.isArray(DS.sections) && DS.sections.length > 0,
          zoom: typeof RF !== 'undefined' ? RF.Geometry.zoom() : null,
        }));

        assert.ok(dsState.hasDS, `[${browserName}] DS must be defined`);
        assert.ok(dsState.elementCount > 0,
          `[${browserName}] DS.elements must have entries, got ${dsState.elementCount}`);
        assert.ok(dsState.hasSections, `[${browserName}] DS.sections must have entries`);
        assert.ok(dsState.zoom !== null && dsState.zoom > 0,
          `[${browserName}] RF.Geometry.zoom() must return a positive number`);

        t.diagnostic(`${browserName}: DS.elements=${dsState.elementCount} zoom=${dsState.zoom}`);

        await assertNoConsoleErrors(consoleErrors, `runtime smoke ${browserName}`);
      } finally {
        await browser.close();
      }
    });
  } finally {
    await server.stop();
  }
});

test('browser compatibility — EngineCore and canonical engines registered in all browsers', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    await forEachBrowser(t, async (t, browserName) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
      try {
        const engines = await page.evaluate(() => ({
          hasEngineCore: typeof EngineCore !== 'undefined',
          hasRenderScheduler: typeof RenderScheduler !== 'undefined',
          hasSelectionEngine: typeof SelectionEngine !== 'undefined',
          hasCanvasLayoutEngine: typeof CanvasLayoutEngine !== 'undefined',
          hasHistoryEngine: typeof HistoryEngine !== 'undefined',
          hasKeyboardEngine: typeof KeyboardEngine !== 'undefined',
          hasZoomEngineV19: typeof ZoomEngineV19 !== 'undefined',
        }));

        for (const [key, value] of Object.entries(engines)) {
          assert.ok(value, `[${browserName}] ${key} must be defined`);
        }

        t.diagnostic(`${browserName}: all canonical engines registered`);
        await assertNoConsoleErrors(consoleErrors, `engines smoke ${browserName}`);
      } finally {
        await browser.close();
      }
    });
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// 2. DOM element rendering — elementos tienen dimensiones > 0 en todos los browsers
// ---------------------------------------------------------------------------

test('browser compatibility — cr-elements have positive dimensions in all browsers', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    await forEachBrowser(t, async (t, browserName) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
      try {
        const elementCheck = await page.evaluate(() => {
          const els = [...document.querySelectorAll('.cr-element[data-id]')]
            .filter((el) => !el.closest('#preview-layer'));

          return els.map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              id: el.dataset.id,
              w: rect.width,
              h: rect.height,
              visible: rect.width > 0 && rect.height > 0,
              hasDataset: !!el.dataset.id,
            };
          });
        });

        assert.ok(elementCheck.length > 0,
          `[${browserName}] must have at least one .cr-element, got 0`);

        const zeroDim = elementCheck.filter((e) => !e.visible);
        assert.equal(zeroDim.length, 0,
          `[${browserName}] elements with zero dimensions: ${JSON.stringify(zeroDim.map((e) => e.id))}`);

        const missingDataset = elementCheck.filter((e) => !e.hasDataset);
        assert.equal(missingDataset.length, 0,
          `[${browserName}] elements missing data-id: ${missingDataset.length}`);

        t.diagnostic(`${browserName}: ${elementCheck.length} elements, all visible with data-id`);
        await assertNoConsoleErrors(consoleErrors, `element dimensions ${browserName}`);
      } finally {
        await browser.close();
      }
    });
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// 3. JS API surface — APIs usadas por engines existen en todos los browsers
// ---------------------------------------------------------------------------

test('browser compatibility — required JS APIs exist in all browsers', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    await forEachBrowser(t, async (t, browserName) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
      try {
        const apis = await page.evaluate(() => ({
          // String APIs used by engines
          matchAll: typeof String.prototype.matchAll === 'function',
          // Structured clone (used for deep copy in some paths)
          structuredClone: typeof structuredClone === 'function',
          // Microtask scheduling
          queueMicrotask: typeof queueMicrotask === 'function',
          // Animation frame
          requestAnimationFrame: typeof requestAnimationFrame === 'function',
          cancelAnimationFrame: typeof cancelAnimationFrame === 'function',
          // DOM APIs used by SelectionOverlay, CanvasLayoutEngine
          querySelectorAll: typeof document.querySelectorAll === 'function',
          getBoundingClientRect: typeof document.body.getBoundingClientRect === 'function',
          // ClassList
          classList: typeof document.body.classList !== 'undefined',
          // Dataset
          dataset: typeof document.body.dataset !== 'undefined',
          // PointerEvents
          pointerEvents: typeof PointerEvent !== 'undefined',
          // ResizeObserver (used for workspace scroll / panel resize)
          resizeObserver: typeof ResizeObserver !== 'undefined',
          // Performance.now (used for timing in RenderScheduler)
          performanceNow: typeof performance !== 'undefined' && typeof performance.now === 'function',
        }));

        const missing = Object.entries(apis)
          .filter(([, v]) => !v)
          .map(([k]) => k);

        assert.equal(missing.length, 0,
          `[${browserName}] missing JS APIs: ${missing.join(', ')}`);

        t.diagnostic(`${browserName}: all required JS APIs present`);
        await assertNoConsoleErrors(consoleErrors, `js apis ${browserName}`);
      } finally {
        await browser.close();
      }
    });
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// 4. CSS box model — host/panel layout consistent across browsers
// ---------------------------------------------------------------------------

test('browser compatibility — host and panel widths are positive and consistent', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    await forEachBrowser(t, async (t, browserName) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
      try {
        const layout = await page.evaluate(() => {
          function w(sel) {
            const el = document.querySelector(sel);
            return el ? el.getBoundingClientRect().width : null;
          }
          function h(sel) {
            const el = document.querySelector(sel);
            return el ? el.getBoundingClientRect().height : null;
          }
          return {
            app: { w: w('#app'), h: h('#app') },
            mainArea: { w: w('#main-area') },
            panelLeft: { w: w('#panel-left') },
            canvasArea: { w: w('#canvas-area') },
            workspace: { w: w('#workspace'), h: h('#workspace') },
            panelRight: { w: w('#panel-right') },
          };
        });

        // App must fill the viewport (1440×980 in harness)
        assert.ok(layout.app.w >= 1400,
          `[${browserName}] #app width ${layout.app.w} must fill viewport (≥1400)`);
        assert.ok(layout.app.h >= 900,
          `[${browserName}] #app height ${layout.app.h} must fill viewport (≥900)`);

        // All regions must have positive width
        for (const [name, dims] of Object.entries(layout)) {
          if (dims.w !== null) {
            assert.ok(dims.w > 0,
              `[${browserName}] #${name} width=${dims.w} must be > 0`);
          }
        }

        // Panels must be narrower than canvas
        if (layout.panelLeft.w && layout.canvasArea.w) {
          assert.ok(layout.panelLeft.w < layout.canvasArea.w,
            `[${browserName}] panel-left (${layout.panelLeft.w}) must be narrower than canvas (${layout.canvasArea.w})`);
        }

        t.diagnostic(`${browserName}: app=${layout.app.w}×${layout.app.h} canvas=${layout.canvasArea.w} panelL=${layout.panelLeft.w} panelR=${layout.panelRight.w}`);
        await assertNoConsoleErrors(consoleErrors, `css layout ${browserName}`);
      } finally {
        await browser.close();
      }
    });
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// 5. Selection click — pointer event basics across browsers
// ---------------------------------------------------------------------------

test('browser compatibility — single click selection works in all browsers', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    await forEachBrowser(t, async (t, browserName) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
      try {
        // Click first element
        const el = page.locator('.cr-element:not(.pv-el)').first();
        await el.click();
        await page.waitForTimeout(120);

        const selState = await page.evaluate(() => ({
          selectionSize: typeof DS !== 'undefined' ? DS.selection.size : 0,
          hasSelectedClass: document.querySelectorAll('.cr-element.selected').length > 0,
        }));

        assert.ok(selState.selectionSize > 0,
          `[${browserName}] click must select an element, DS.selection.size=${selState.selectionSize}`);
        assert.ok(selState.hasSelectedClass,
          `[${browserName}] selected element must have .selected class`);

        t.diagnostic(`${browserName}: click selection OK, selectionSize=${selState.selectionSize}`);

        // Webkit known limitation: some pointer events may behave differently
        // but basic click selection must work in all browsers
        await assertNoConsoleErrors(consoleErrors, `click selection ${browserName}`);
      } finally {
        await browser.close();
      }
    });
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// 6. Gap: webkit pointer drag limitation
// ---------------------------------------------------------------------------

test('browser compatibility — DEFERRED: webkit pointer drag is limited in headless mode', () => {
  const GAP = {
    id: 'BROWSER-WEBKIT-001',
    description: 'WebKit headless does not fully support pointermove during drag sequences',
    browsers_affected: ['webkit'],
    workaround: 'fast_interaction_smoke and flaky_detection run chromium-only',
    implemented_in: null, // pending webkit-specific drag harness
  };
  assert.ok(GAP.id);
  assert.equal(GAP.implemented_in, null, 'webkit drag gap is unimplemented');
});
