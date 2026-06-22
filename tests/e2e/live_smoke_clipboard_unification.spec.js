/**
 * LIVE SMOKE — Clipboard unification (P23B).
 *
 * Corre contra la app REAL en http://127.0.0.1:8080/classic. No usa mocks.
 *
 * Hasta P23A, copy/cut/paste tenían DOS rutas independientes que no
 * compartían almacenamiento:
 *   - menú/toolbar (data-action="copy"/"cut"/"paste") → CommandRuntimeSelection.* → DS.clipboard
 *   - Ctrl+C/X/V (KeyboardEngine.js)                  → ClipboardEngine.*        → su propio storage interno
 *
 * Copiar por una ruta y pegar por la otra fallaba en silencio (P22D/P22E).
 * P23B corrigió esto haciendo que CommandRuntimeSelection.copy/cut/paste()
 * delegue a ClipboardEngine cuando está cargado (siempre, en producción).
 * Toda la verificación de P22-P23 fue contra stubs de Node vía vm — este
 * smoke confirma el mismo comportamiento contra el navegador real, DOM
 * real y dispatch real de eventos (click + atajos de teclado), no contra
 * una simulación.
 *
 * Uso:
 *   RF_LIVE_URL="http://127.0.0.1:8080" \
 *   npx playwright test tests/e2e/live_smoke_clipboard_unification.spec.js -c pw.rf-live.config.mjs --reporter=line
 */

import { test, expect } from '@playwright/test';

const MOD_KEY = process.platform === 'darwin' ? 'Meta' : 'Control';

async function bootClassic(page) {
  await page.goto('/classic', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!window.DS && !!window.CommandRuntimeSelection && !!window.ClipboardEngine,
    null,
    { timeout: 30000 },
  );
}

/**
 * Ensures at least one real element exists on the canvas, created through
 * the same canonical write path the app itself uses (DS.setElements +
 * _canonicalCanvasWriter().renderElement + DS.selectOnly) — not a raw
 * mouse drag through InsertEngine's click-and-drag tool, which this smoke
 * does not need to exercise. Returns the element id.
 */
async function ensureSeedElement(page) {
  const existing = await page.evaluate(() => window.DS?.elements?.[0]?.id || null);
  if (existing) return existing;

  return page.evaluate(() => {
    const el = mkEl('text', 'ph', 20, 20, 120, 16, {
      content: 'clipboard-smoke',
      bgColor: 'transparent',
      borderColor: 'transparent',
    });
    window.DS.setElements([...window.DS.elements, el], 'live-smoke-clipboard.seed');
    _canonicalCanvasWriter().renderElement(el);
    window.DS.selectOnly(el.id, 'live-smoke-clipboard.seed');
    window.DS.saveHistory();
    return el.id;
  });
}

async function selectFirstElement(page) {
  await page.locator('.cr-element:not(.pv-el)').first().click();
  await page.waitForFunction(() => (window.DS?.selection?.size ?? window.DS?.selection?.length ?? 0) > 0, null, {
    timeout: 5000,
  });
}

async function elementCount(page) {
  return page.evaluate(() => window.DS.elements.length);
}

async function clickToolbarAction(page, action) {
  await page.locator(`.tb-icon[data-action="${action}"]`).click();
}

test.describe('LIVE: clipboard unification (menu vs keyboard interop)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await bootClassic(page);
  });

  test('menu copy → Ctrl+V paste succeeds (previously silently failed)', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', (err) => browserErrors.push(`PAGEERROR: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') browserErrors.push(`console.error: ${msg.text().slice(0, 200)}`); });

    await ensureSeedElement(page);
    await selectFirstElement(page);
    const before = await elementCount(page);

    await clickToolbarAction(page, 'copy'); // menu/toolbar path → ClipboardEngine
    await page.keyboard.press(`${MOD_KEY}+V`); // keyboard path reads the SAME storage now

    await page.waitForTimeout(300);
    const after = await elementCount(page);

    console.log('LIVE-CLIPBOARD[menu-copy-ctrlv-paste]', JSON.stringify({ before, after, browserErrors }));
    expect(after, 'Ctrl+V must paste the element copied via the menu/toolbar').toBe(before + 1);
    expect.soft(browserErrors, 'no browser errors during menu-copy → Ctrl+V').toEqual([]);
  });

  test('Ctrl+C copy → menu paste succeeds (previously silently failed)', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', (err) => browserErrors.push(`PAGEERROR: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') browserErrors.push(`console.error: ${msg.text().slice(0, 200)}`); });

    await ensureSeedElement(page);
    await selectFirstElement(page);
    const before = await elementCount(page);

    await page.keyboard.press(`${MOD_KEY}+C`); // keyboard path → ClipboardEngine
    await clickToolbarAction(page, 'paste'); // menu/toolbar path reads the SAME storage now

    await page.waitForTimeout(300);
    const after = await elementCount(page);

    console.log('LIVE-CLIPBOARD[ctrlc-copy-menu-paste]', JSON.stringify({ before, after, browserErrors }));
    expect(after, 'menu paste must paste the element copied via Ctrl+C').toBe(before + 1);
    expect.soft(browserErrors, 'no browser errors during Ctrl+C → menu-paste').toEqual([]);
  });

  test('mixed cut: menu cut → Ctrl+V paste does not lose the element', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', (err) => browserErrors.push(`PAGEERROR: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') browserErrors.push(`console.error: ${msg.text().slice(0, 200)}`); });

    await ensureSeedElement(page);
    await selectFirstElement(page);
    const before = await elementCount(page);

    await clickToolbarAction(page, 'cut'); // menu cut — removes the element, stores it via ClipboardEngine
    const afterCut = await elementCount(page);
    expect(afterCut, 'menu cut must remove the element from the canvas').toBe(before - 1);

    await page.keyboard.press(`${MOD_KEY}+V`); // Ctrl+V must bring it back
    await page.waitForTimeout(300);
    const afterPaste = await elementCount(page);

    console.log('LIVE-CLIPBOARD[menu-cut-ctrlv-paste]', JSON.stringify({ before, afterCut, afterPaste, browserErrors }));
    expect(afterPaste, 'Ctrl+V must restore the cut element — no data loss').toBe(before);
    expect.soft(browserErrors, 'no browser errors during mixed cut (menu → keyboard)').toEqual([]);
  });

  test('mixed cut, the other way: Ctrl+X cut → menu paste does not lose the element', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', (err) => browserErrors.push(`PAGEERROR: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') browserErrors.push(`console.error: ${msg.text().slice(0, 200)}`); });

    await ensureSeedElement(page);
    await selectFirstElement(page);
    const before = await elementCount(page);

    await page.keyboard.press(`${MOD_KEY}+X`); // Ctrl+X cut — removes the element, stores it via ClipboardEngine
    const afterCut = await elementCount(page);
    expect(afterCut, 'Ctrl+X must remove the element from the canvas').toBe(before - 1);

    await clickToolbarAction(page, 'paste'); // menu paste must bring it back
    await page.waitForTimeout(300);
    const afterPaste = await elementCount(page);

    console.log('LIVE-CLIPBOARD[ctrlx-cut-menu-paste]', JSON.stringify({ before, afterCut, afterPaste, browserErrors }));
    expect(afterPaste, 'menu paste must restore the Ctrl+X-cut element — no data loss').toBe(before);
    expect.soft(browserErrors, 'no browser errors during mixed cut (keyboard → menu)').toEqual([]);
  });
});
