/**
 * RF-FIREFOX-SAVE-AS-DOWNLOAD-PARITY-1
 *
 * Reopened after RF-FIREFOX-PERMISSION-MODAL-DOUBLEFIRE-1: "Nuevo" is
 * fixed (1 modal), but Guardar/Guardar como in Firefox download straight
 * to ~/Descargas — that is NOT parity with Chrome/Ungoogled opening a
 * real native save dialog. This is a genuine BROWSER limitation, not an
 * RF bug to "fix the same way" — Firefox simply has no File System
 * Access API to call. Confirmed live (real Firefox via Playwright, not
 * assumed):
 *
 *   Browser              | showOpenFilePicker | showSaveFilePicker
 *   ---------------------|---------------------|---------------------
 *   Chromium (Chrome/     | yes                 | yes
 *    Ungoogled, same      |                     |
 *    engine)              |                     |
 *   Firefox               | no                  | no
 *
 *   Action          | Chrome/Ungoogled                  | Firefox
 *   -----------------|-----------------------------------|--------------------------------
 *   Guardar (handle  | writes directly, no prompt        | (handle never exists — Firefox's
 *    exists)         |                                    |  open() never gets a real handle
 *                    |                                    |  either, since it also has no
 *                    |                                    |  showOpenFilePicker)
 *   Guardar (no      | delegates to Guardar como          | delegates to Guardar como
 *    handle)         |                                    |
 *   Guardar como     | real native save dialog + the      | plain download to Descargas,
 *                    | browser's own overwrite confirm    | status message EXPLICITLY says
 *                    |                                    | so (not "Guardado como")
 *
 * The fix is NOT a polyfilled picker (none exists for Firefox) — it's
 * that the app must never claim "Guardado como: X" for what is actually
 * just a browser download the user has to manually relocate. The status
 * message is the user-visible contract this test guards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

test('LIVE (real Firefox): confirms NO File System Access API at all (browser limitation, not an RF bug)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName: 'firefox' });
  try {
    const caps = await page.evaluate(() => ({
      hasShowOpenFilePicker: typeof window.showOpenFilePicker === 'function',
      hasShowSaveFilePicker: typeof window.showSaveFilePicker === 'function',
    }));
    assert.equal(caps.hasShowOpenFilePicker, false, 'Firefox must have no showOpenFilePicker (confirms this is a platform gap, not something RF broke)');
    assert.equal(caps.hasShowSaveFilePicker, false, 'Firefox must have no showSaveFilePicker');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE (real Firefox): "Guardar como" downloads AND clearly labels it as a browser limitation, not a real save dialog', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName: 'firefox' });
  try {
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => CommandRuntimeFileIO.saveAs());
    const download = await downloadPromise;
    await page.waitForTimeout(150);
    const status = await page.evaluate(() => document.getElementById('sb-msg')?.textContent);

    assert.match(download.suggestedFilename(), /\.rfd\.json$/, 'Guardar como must still produce a real downloadable file in Firefox');
    assert.doesNotMatch(status, /^✓ Guardado como/, 'must NOT claim "Guardado como" — that wording implies a real save dialog, which Firefox cannot offer');
    assert.match(status, /navegador no soporta/i, 'status must explicitly name this as a browser limitation, not a generic success message');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE (real Firefox): "Guardar" with no handle behaves exactly like "Guardar como" (same labeled-download fallback)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName: 'firefox' });
  try {
    const hasHandle = await page.evaluate(() => !!CommandRuntimeFile._currentLayoutFileHandle);
    assert.equal(hasHandle, false, 'fixture assumption: a fresh Firefox session has no file handle (it never can, by platform limitation)');

    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => CommandRuntimeFileIO.save());
    await downloadPromise;
    await page.waitForTimeout(150);
    const status = await page.evaluate(() => document.getElementById('sb-msg')?.textContent);
    assert.match(status, /navegador no soporta/i, 'Guardar without a handle must fall back to the SAME labeled-download path as Guardar como in Firefox');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE (Chromium): the SAME action gets the real native dialog wording, not the browser-limitation message', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const status = await page.evaluate(async () => {
      window.showSaveFilePicker = async () => ({
        name: 'mi_reporte.rfd.json',
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      });
      await CommandRuntimeFileIO.saveAs();
      return document.getElementById('sb-msg')?.textContent;
    });
    assert.match(status, /^✓ Guardado como/, 'Chromium/Ungoogled (real picker available) must get the real "Guardado como" wording');
    assert.doesNotMatch(status, /navegador no soporta/i, 'must NOT show the browser-limitation message when a real picker was actually used');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: plain "Exportar diseño" (.rfd.json) is unaffected — keeps its own generic message regardless of browser', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => CommandRuntimeFileIO.exportJSON());
    await downloadPromise;
    await page.waitForTimeout(150);
    const status = await page.evaluate(() => document.getElementById('sb-msg')?.textContent);
    assert.equal(status, '✓ JSON exportado', 'the standalone "Exportar diseño" action is an intentional download by design — its own message must stay unchanged');
  } finally {
    await browser.close();
    await server.stop();
  }
});
