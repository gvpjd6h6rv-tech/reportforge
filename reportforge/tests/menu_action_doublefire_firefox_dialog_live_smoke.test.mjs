/**
 * RF-FIREFOX-PERMISSION-MODAL-DOUBLEFIRE-1
 *
 * Reported bug (manual smoke, real browsers): in Firefox, "Archivo >
 * Nuevo" showed TWO confirm() dialogs for one click — the first plain,
 * the second with Firefox's "don't allow this page to create more
 * dialogs" checkbox (a heuristic Firefox applies when a page shows two
 * dialogs in quick succession). Checking that box and accepting silently
 * suppresses ALL future confirm()/alert()/prompt() calls on the page —
 * which made "Nuevo" appear to work only once, and made "Guardar"/
 * "Guardar como" look permanently broken afterward (no hard reset fixes
 * it, since the suppression is a Firefox-side, not app-side, state).
 * Chrome/Ungoogled tolerate the same double-fire silently (no visible
 * symptom), which is why this only showed up as a Firefox bug.
 *
 * Root cause (confirmed live, not hypothesized): every [data-action]
 * element in the app is EITHER a toolbar .tb-icon button OR a dropdown
 * .dd-item — and .dd-item is already exclusively bound by
 * MenuAdapters.js's MenuEngine.init(). UIAdapters.js's bindToolbar() used
 * an unscoped `document.querySelectorAll('[data-action]')`, which ALSO
 * matched every .dd-item, giving each one TWO click listeners. Every
 * single dropdown-menu action in the whole app (not just Nuevo/Guardar)
 * ran twice per click. Confirmed live (Playwright dialog/call counters,
 * both Chromium and real Firefox): one click on a .dd-item fired
 * confirm()/save()/saveAs() exactly twice before the fix.
 *
 * Fix: scope bindToolbar()'s selector to '.tb-icon[data-action]' only.
 *
 * Also fixes the related Guardar/Guardar como semantics gap surfaced
 * during this audit: save() with no file handle used to silently write
 * to localStorage (prompt() for a name, no real file ever produced) —
 * now it delegates to saveAs() (real save dialog / download), matching
 * "Guardar must behave like Guardar como when there's no file yet."
 * save() with an existing handle still never re-prompts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

async function countDialogsForMenuClick(page, action) {
  let dialogCount = 0;
  const handler = async (dialog) => { dialogCount++; await dialog.accept(); };
  page.on('dialog', handler);
  await page.click('.menu-item[data-menu="archivo"]');
  await page.waitForTimeout(150);
  await page.click(`.dd-item[data-action="${action}"]`);
  await page.waitForTimeout(200);
  page.off('dialog', handler);
  return dialogCount;
}

test('LIVE (Chromium): one click on a dropdown menu item fires its action exactly once, not twice', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const dialogCount = await countDialogsForMenuClick(page, 'new');
    assert.equal(dialogCount, 1, 'Archivo > Nuevo must show exactly one confirm() dialog per click');

    await page.evaluate(() => {
      window.__saveCalls = 0;
      window.__saveAsCalls = 0;
      const os = CommandRuntimeFileIO.save, osa = CommandRuntimeFileIO.saveAs;
      CommandRuntimeFileIO.save = (...a) => { window.__saveCalls++; return os(...a); };
      CommandRuntimeFileIO.saveAs = (...a) => { window.__saveAsCalls++; return osa(...a); };
    });
    await page.click('.menu-item[data-menu="archivo"]');
    await page.waitForTimeout(150);
    await page.click('.dd-item[data-action="save"]');
    await page.waitForTimeout(300);
    let r = await page.evaluate(() => window.__saveCalls);
    assert.equal(r, 1, 'Archivo > Guardar must call save() exactly once per click');

    await page.click('.menu-item[data-menu="archivo"]');
    await page.waitForTimeout(150);
    await page.click('.dd-item[data-action="save-as"]');
    await page.waitForTimeout(300);
    r = await page.evaluate(() => window.__saveAsCalls);
    assert.equal(r, 1, 'Archivo > Guardar como must call saveAs() exactly once per click');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE (Chromium): toolbar buttons (.tb-icon) still fire exactly once after the selector fix', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    let dialogCount = 0;
    page.on('dialog', async (dialog) => { dialogCount++; await dialog.accept(); });
    await page.click('button.tb-icon[data-action="new"]');
    await page.waitForTimeout(150);
    assert.equal(dialogCount, 1, 'toolbar "Nuevo" button must still fire exactly once (not zero, not twice)');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE (real Firefox): one click on a dropdown menu item fires its action exactly once', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName: 'firefox' });
  try {
    const dialogCount = await countDialogsForMenuClick(page, 'new');
    assert.equal(dialogCount, 1, 'FIREFOX: Archivo > Nuevo must show exactly one confirm() dialog — the double-fire is exactly what triggered the "don\'t show again" lockup');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: "Guardar" with no existing file handle behaves like "Guardar como" (real dialog/download), not silent localStorage', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const result = await page.evaluate(async () => {
      let pickerCalled = false;
      window.showSaveFilePicker = async () => {
        pickerCalled = true;
        return { name: 'nuevo.rfd.json', createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
      };
      const hadHandleBefore = !!CommandRuntimeFile._currentLayoutFileHandle;
      await CommandRuntimeFileIO.save();
      return { hadHandleBefore, pickerCalled, handleAfter: CommandRuntimeFile._currentLayoutFileHandle?.name };
    });
    assert.equal(result.hadHandleBefore, false, 'fixture assumption: no handle should exist yet on a fresh load');
    assert.equal(result.pickerCalled, true, 'Guardar with no handle must open a real save dialog (same as Guardar como), not write to localStorage');
    assert.equal(result.handleAfter, 'nuevo.rfd.json', 'Guardar must adopt the newly picked file as the tracked handle');

    const result2 = await page.evaluate(async () => {
      let pickerCalledAgain = false;
      const orig = window.showSaveFilePicker;
      window.showSaveFilePicker = async (...a) => { pickerCalledAgain = true; return orig(...a); };
      await CommandRuntimeFileIO.save();
      return { pickerCalledAgain };
    });
    assert.equal(result2.pickerCalledAgain, false, 'a SECOND Guardar must reuse the now-existing handle, not reopen the picker');
  } finally {
    await browser.close();
    await server.stop();
  }
});
