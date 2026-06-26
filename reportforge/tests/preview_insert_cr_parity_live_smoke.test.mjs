'use strict';
/**
 * RF-PREVIEW-INSERT-CR-PARITY-1 — live smoke
 *
 * Root cause: InsertEngine.setTool() did not call PreviewEngineMode.hide()
 * before activating a draw tool, so onCanvasMouseDown hard-blocked all
 * drawing while DS.previewMode === true.
 *
 * Fix (engines/InsertEngine.js:7):
 *   if(tool !== 'pointer' && DS.previewMode && typeof PreviewEngineMode !== 'undefined')
 *     PreviewEngineMode.hide();
 *
 * Browsers: chromium (Chrome), firefox, Ungoogled Chromium (Flatpak).
 *
 * Tests:
 *   LIVE-CHROME         — insert barcode from Preview → auto-switch to Design, element created
 *   LIVE-FIREFOX        — same scenario on Firefox
 *   LIVE-UNGOOGLED      — same scenario on Ungoogled Chromium (Flatpak)
 *   META-REMOVED        — fix removed (browser patch): previewMode stays true → bug reproduced
 *   META-REAPPLIED      — fix in source (no patch): PASS again
 *   META-UNGOOGLED-REMOVED — metamorphic validation on Ungoogled
 *   REGRESSION          — insert text in Design still works after fix
 *   ADVERSARIAL         — existing elements not corrupted by preview→insert→design flow
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import path   from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium as playwrightChromium } from 'playwright';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ungoogled Chromium ships as a Flatpak; its binary requires the Flatpak
// runtime libs, so it can only run via the flatpak wrapper — not directly.
const UNGOOGLED_WRAPPER = path.resolve(__dirname,
  '../../scripts/ungoogled-chromium-wrapper.sh');

async function launchUngoogledPage(baseUrl) {
  const browser = await playwrightChromium.launch({
    executablePath: UNGOOGLED_WRAPPER,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => { consoleErrors.push(`PAGEERROR: ${err.message}`); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement?.dataset?.rfRuntimeReady === '1',
    null, { timeout: 15000 },
  );
  await page.waitForFunction(
    () => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0,
  );
  await page.waitForTimeout(800);
  return { browser, page, consoleErrors };
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

async function openInsertMenu(page) {
  await page.locator('.menu-item[data-menu="insertar"]').click();
  await page.waitForSelector('#dd-insertar', { state: 'visible' });
}

async function clickInsertBarcode(page) {
  await page.locator('#dd-insertar .dd-item[data-action="insert-barcode"]').click();
  await page.waitForTimeout(400);
}

async function drawOnCanvas(page) {
  const ws  = page.locator('#workspace');
  const box = await ws.boundingBox();
  assert.ok(box, '#workspace must be visible');
  const cx = box.x + box.width  * 0.35;
  const cy = box.y + box.height * 0.4;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 200, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function getState(page) {
  return page.evaluate(() => ({
    previewMode:      !!window.DS?.previewMode,
    tool:             window.DS?.tool,
    elementTypes:     (window.DS?.elements || []).map(e => e.type),
    barcodes:         (window.DS?.elements || []).filter(e => e.type === 'barcode')
                        .map(e => ({ id: e.id, barcodeType: e.barcodeType, showText: e.showText })),
    tabDesignActive:  !!document.getElementById('tab-design')?.classList.contains('active'),
    tabPreviewActive: !!document.getElementById('tab-preview')?.classList.contains('active'),
    hasBarcodeProps:  !!(document.getElementById('prop-barcode-type') ||
                         document.getElementById('prop-barcode-showtext') ||
                         document.querySelector('#properties-panel select')),
  }));
}

// ── core scenario ─────────────────────────────────────────────────────────────

async function runInsertFromPreviewScenario(page) {
  // Start in Design, verify
  const init = await getState(page);
  assert.ok(!init.previewMode, 'must start in Design mode');

  const countBefore = init.elementTypes.length;

  // Enter Preview
  await enterPreview(page);
  const inPreview = await getState(page);
  assert.ok(inPreview.previewMode,      'must be in Preview after enterPreview()');
  assert.ok(inPreview.tabPreviewActive, 'Preview sub-tab must be active');

  // Insert barcode from Preview (triggers the fix)
  await openInsertMenu(page);
  await clickInsertBarcode(page);

  const afterTool = await getState(page);
  assert.ok(!afterTool.previewMode,     'previewMode must be false — fix auto-switched to Design');
  assert.ok(afterTool.tabDesignActive,  'Design sub-tab must be active');
  assert.equal(afterTool.tool, 'barcode', 'active tool must be "barcode"');

  // Draw the element
  await drawOnCanvas(page);

  const afterDraw = await getState(page);
  assert.ok(afterDraw.barcodes.length > 0,
    `barcode element must be created (elements: ${JSON.stringify(afterDraw.elementTypes)})`);
  assert.equal(afterDraw.barcodes[0].barcodeType, 'code128', 'default barcodeType must be code128');
  assert.equal(afterDraw.barcodes[0].showText,    true,      'default showText must be true');
  assert.ok(afterDraw.hasBarcodeProps, 'PropertiesEngine must render barcode controls');

  return afterDraw;
}

// ── LIVE-CHROME: fix applied ──────────────────────────────────────────────────
// PRE-EXISTING: Chromium logs net::ERR_EMPTY_RESPONSE for /preview-barcode img
// requests. This is a pre-existing issue with the barcode endpoint in Chromium
// (Firefox does not log this error). Existing barcode smokes (barcode_align_*,
// barcode_resize_*) skip assertNoConsoleErrors for the same reason.
// Scenario assertions (mode-switch, element creation, properties) all pass.
function filterBarcodeImageErrors(errors) {
  return errors.filter(e => !e.includes('ERR_EMPTY_RESPONSE') && !e.includes('preview-barcode'));
}

test('LIVE-CHROME: insert barcode from Preview auto-switches to Design [fix applied]', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName: 'chromium' });
  try {
    await runInsertFromPreviewScenario(page);
    await assertNoConsoleErrors(filterBarcodeImageErrors(consoleErrors), 'chrome-insert-barcode-from-preview');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── LIVE-FIREFOX: fix applied ─────────────────────────────────────────────────
test('LIVE-FIREFOX: insert barcode from Preview auto-switches to Design [fix applied]', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName: 'firefox' });
  try {
    await runInsertFromPreviewScenario(page);
    await assertNoConsoleErrors(consoleErrors, 'firefox-insert-barcode-from-preview');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── META-REMOVED: fix removed in browser → must reproduce original bug ────────
test('META-REMOVED: setTool without hide() keeps previewMode=true [original bug reproduced]', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName: 'chromium' });
  try {
    // Patch InsertEngine.setTool in the browser: remove the PreviewEngineMode.hide() call
    await page.evaluate(() => {
      window.InsertEngine.setTool = function setToolBuggy(tool) {
        // Deliberately omits: PreviewEngineMode.hide()
        window.DS.setTool(tool, 'InsertEngine.setTool');
        document.querySelectorAll('[data-tool]').forEach(b =>
          b.classList.toggle('active', b.dataset.tool === tool));
        const cs = document.getElementById('workspace');
        cs.className = ''; cs.classList.add(`tool-${tool}`);
        if (tool === 'pointer') window.SelectionEngine._drag = null;
      };
    });

    await enterPreview(page);
    const inPreview = await getState(page);
    assert.ok(inPreview.previewMode, 'must be in Preview before test');

    await openInsertMenu(page);
    await clickInsertBarcode(page);

    const afterTool = await getState(page);
    // With the bug: previewMode must remain true — no auto-switch happened
    assert.ok(afterTool.previewMode,
      'BUG CONFIRMED: previewMode stays true when fix is removed — proves fix is necessary');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── META-REAPPLIED: fix in source → PASS again ───────────────────────────────
test('META-REAPPLIED: source fix reapplied — insert from Preview works correctly', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName: 'chromium' });
  try {
    // No browser patches — source already has the fix
    await runInsertFromPreviewScenario(page);
    await assertNoConsoleErrors(filterBarcodeImageErrors(consoleErrors), 'meta-reapplied');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── REGRESSION: insert text in Design still works ────────────────────────────
test('REGRESSION: insert text in Design mode unaffected by preview fix', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName: 'chromium' });
  try {
    const init = await getState(page);
    assert.ok(!init.previewMode, 'must start in Design');

    // Insert text via menu
    await page.locator('.menu-item[data-menu="insertar"]').click();
    await page.waitForSelector('#dd-insertar', { state: 'visible' });
    await page.locator('#dd-insertar .dd-item[data-action="insert-text"]').click();
    await page.waitForTimeout(200);

    const toolState = await getState(page);
    assert.equal(toolState.tool, 'text', 'text tool must activate');
    assert.ok(!toolState.previewMode,    'must remain in Design');

    await drawOnCanvas(page);

    const after = await getState(page);
    const texts = after.elementTypes.filter(t => t === 'text');
    assert.ok(texts.length > 0, 'text element must be created in Design');

    await assertNoConsoleErrors(consoleErrors, 'regression-design-text');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── ADVERSARIAL: existing elements not lost during preview→insert flow ────────
test('ADVERSARIAL: preview→insert→design does not corrupt existing elements', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName: 'chromium' });
  try {
    const initState   = await getState(page);
    const countBefore = initState.elementTypes.length;
    assert.ok(countBefore > 0, 'default factura layout must have elements');

    // Go to Preview, insert barcode, draw it
    await enterPreview(page);
    await openInsertMenu(page);
    await clickInsertBarcode(page);
    await drawOnCanvas(page);

    const finalState   = await getState(page);
    const countAfter   = finalState.elementTypes.length;
    const barcodeCount = finalState.barcodes.length;

    assert.ok(countAfter >= countBefore,
      `must not lose elements (before=${countBefore}, after=${countAfter})`);
    assert.ok(barcodeCount > 0, 'barcode must be added');
    assert.ok(!finalState.previewMode, 'must end in Design mode');

    await assertNoConsoleErrors(filterBarcodeImageErrors(consoleErrors), 'adversarial-existing-elements');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── LIVE-UNGOOGLED: fix applied ───────────────────────────────────────────────
// Ungoogled Chromium 149 (Flatpak) — launched via wrapper that calls
// `flatpak run --command=chromium io.github.ungoogled_software.ungoogled_chromium`.
// Same ERR_EMPTY_RESPONSE pre-existing issue applies as with Chrome.
test('LIVE-UNGOOGLED: insert barcode from Preview auto-switches to Design [fix applied]', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchUngoogledPage(server.baseUrl);
  try {
    await runInsertFromPreviewScenario(page);
    await assertNoConsoleErrors(filterBarcodeImageErrors(consoleErrors), 'ungoogled-insert-barcode-from-preview');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── META-UNGOOGLED-REMOVED: metamorphic on Ungoogled ─────────────────────────
test('META-UNGOOGLED-REMOVED: setTool without hide() keeps previewMode=true on Ungoogled', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchUngoogledPage(server.baseUrl);
  try {
    await page.evaluate(() => {
      window.InsertEngine.setTool = function setToolBuggy(tool) {
        window.DS.setTool(tool, 'InsertEngine.setTool');
        document.querySelectorAll('[data-tool]').forEach(b =>
          b.classList.toggle('active', b.dataset.tool === tool));
        const cs = document.getElementById('workspace');
        cs.className = ''; cs.classList.add(`tool-${tool}`);
        if (tool === 'pointer') window.SelectionEngine._drag = null;
      };
    });

    await enterPreview(page);
    const inPreview = await getState(page);
    assert.ok(inPreview.previewMode, 'must be in Preview before test');

    await openInsertMenu(page);
    await clickInsertBarcode(page);

    const afterTool = await getState(page);
    assert.ok(afterTool.previewMode,
      'BUG CONFIRMED on Ungoogled: previewMode stays true when fix is removed');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ── ADVERSARIAL-UNGOOGLED: existing elements preserved on Ungoogled ───────────
test('ADVERSARIAL-UNGOOGLED: preview→insert→design does not corrupt elements on Ungoogled', {
  timeout: 120_000,
}, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchUngoogledPage(server.baseUrl);
  try {
    const initState   = await getState(page);
    const countBefore = initState.elementTypes.length;
    assert.ok(countBefore > 0, 'default factura layout must have elements');

    await enterPreview(page);
    await openInsertMenu(page);
    await clickInsertBarcode(page);
    await drawOnCanvas(page);

    const finalState  = await getState(page);
    assert.ok(finalState.elementTypes.length >= countBefore,
      `must not lose elements (before=${countBefore}, after=${finalState.elementTypes.length})`);
    assert.ok(finalState.barcodes.length > 0,   'barcode must be added');
    assert.ok(!finalState.previewMode,           'must end in Design mode');
    assert.equal(finalState.barcodes[0].barcodeType, 'code128', 'barcodeType must be code128');
    assert.equal(finalState.barcodes[0].showText,    true,      'showText must be true');
    assert.ok(finalState.hasBarcodeProps,        'PropertiesEngine must render barcode controls');

    await assertNoConsoleErrors(filterBarcodeImageErrors(consoleErrors), 'adversarial-ungoogled');
  } finally {
    await browser.close();
    await server.stop();
  }
});
