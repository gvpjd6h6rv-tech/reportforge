/**
 * RF-PRODUCTION-CERTIFICATION-DESIGN-PREVIEW-1 — Save/Save As audit.
 *
 * Found auditing the certification matrix's "Atajos" / "Archivo" rows:
 *
 *   1. Ctrl+S and Ctrl+O were never registered in KeyboardEngine.js, even
 *      though the menu/toolbar already advertise them as shortcut labels
 *      ("Guardar (Ctrl+S)", "<span class=dd-shortcut>Ctrl+S</span>").
 *      Confirmed live: pressing either key produced zero calls to
 *      FileEngine.save()/load(). Fixed by registering both, delegating to
 *      the same handlers the toolbar buttons already use.
 *
 *   2. "Guardar como" (save-as) was a bare alias for exportJSON() — a
 *      blind <a download> anchor click with NO file dialog and NO
 *      overwrite confirmation. Real-world evidence this causes problems:
 *      ~/Descargas has 6 numbered duplicates of the same export
 *      (Factura_A4_editable.rfd.json, (1)...(5)) from exactly this
 *      behavior. Fixed by using showSaveFilePicker() when available —
 *      a real native save dialog with the BROWSER'S OWN overwrite
 *      confirmation — falling back to the old exportJSON() behavior
 *      where the API isn't supported (mirrors load()'s own
 *      showOpenFilePicker feature-detection pattern). A successful
 *      save-as also updates the tracked file handle, so a subsequent
 *      Ctrl+S/Guardar overwrites the NEW file directly instead of the
 *      original.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

test('LIVE: Ctrl+S calls FileEngine.save(), Ctrl+O calls FileEngine.load()', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.evaluate(() => {
      window.__saveCalls = 0;
      window.__openCalls = 0;
      const origSave = CommandRuntimeFileIO.save;
      const origLoad = CommandRuntimeFileIO.load;
      CommandRuntimeFileIO.save = (...args) => { window.__saveCalls++; return origSave(...args); };
      CommandRuntimeFileIO.load = (...args) => { window.__openCalls++; return origLoad(...args); };
    });

    await page.keyboard.press('Control+s');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+o');
    await page.waitForTimeout(150);

    const result = await page.evaluate(() => ({ saveCalls: window.__saveCalls, openCalls: window.__openCalls }));
    assert.equal(result.saveCalls, 1, 'Ctrl+S must trigger FileEngine.save() exactly once');
    assert.equal(result.openCalls, 1, 'Ctrl+O must trigger FileEngine.load() exactly once');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: "Guardar como" uses showSaveFilePicker (real dialog + native overwrite confirmation) when available', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const result = await page.evaluate(async () => {
      let written = null;
      window.showSaveFilePicker = async () => ({
        name: 'mi_reporte.rfd.json',
        createWritable: async () => ({
          write: async (text) => { written = text; },
          close: async () => {},
        }),
      });
      await CommandRuntimeFileIO.saveAs();
      const handle = CommandRuntimeFile._currentLayoutFileHandle;
      let parsedOk = false;
      try { JSON.parse(written); parsedOk = true; } catch (_) {}
      return { wroteRealJson: parsedOk, handleUpdated: !!handle && handle.name === 'mi_reporte.rfd.json' };
    });
    assert.equal(result.wroteRealJson, true, 'saveAs must write the real layout JSON through the picked file handle');
    assert.equal(result.handleUpdated, true, 'saveAs must update the tracked file handle so a later Ctrl+S overwrites the NEW file');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: "Guardar como" falls back to a real download when showSaveFilePicker is unavailable', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.evaluate(() => { delete window.showSaveFilePicker; });
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => { CommandRuntimeFileIO.saveAs(); });
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.rfd\.json$/, 'fallback save-as must still produce a real downloadable file');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: "Guardar" overwrites the already-open file handle directly (no prompt) when one exists', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const result = await page.evaluate(async () => {
      let lastWritten = null;
      const fakeHandle = {
        name: 'factura_fv1.json',
        queryPermission: async () => 'granted',
        createWritable: async () => ({
          write: async (text) => { lastWritten = text; },
          close: async () => {},
        }),
      };
      CommandRuntimeFile._applyLoadedLayout(
        { name: 'Factura Test', sections: [{ id: 's1', stype: 'rh', height: 50 }], elements: [] },
        { name: 'factura_fv1.json' },
        fakeHandle,
        'opened',
      );
      await CommandRuntimeFileIO.save();
      let writtenName = null;
      try { writtenName = JSON.parse(lastWritten).name; } catch (_) {}
      return { handleStillTracked: CommandRuntimeFile._currentLayoutFileHandle === fakeHandle, writtenName };
    });
    assert.equal(result.handleStillTracked, true, 'save() must keep using the same already-open file handle');
    assert.equal(result.writtenName, 'Factura Test', 'save() must write the current (possibly edited) layout back to that file');
  } finally {
    await browser.close();
    await server.stop();
  }
});
