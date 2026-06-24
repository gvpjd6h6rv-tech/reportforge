/**
 * RF: "Archivo > Nuevo" (data-action="new", menu shows shortcut "Ctrl+N").
 *
 * Root cause correction: an EARLIER version of this fix added a second,
 * competing 'new' handler in engines/CommandRuntimeHandlersFile.js
 * (handleFileCommands, checked before handleDialogCommands in
 * engines/CommandRuntimeHandlers.js's dispatch chain). That silently
 * replaced the real, already-working, single owner —
 * engines/CommandRuntimeHandlersDialog.js:runNewReport() — which already
 * clears DS.elements, resets section heights, clears selection and saves
 * history, gated behind a native confirm(). Proven by
 * reportforge/tests/command_runtime_handlers.test.mjs, which already
 * asserted `calls.selection` gets a `setElements(..., 'CommandRuntimeHandlers.new', 0)`
 * call and passed against the ORIGINAL code before any 'new' was added to
 * the File family. The duplicate handler has been removed; this file now
 * exercises the real (Dialog-family) single-owner path end-to-end,
 * including the confirm() gate Playwright must explicitly accept.
 *
 * Missing piece that genuinely needed fixing: KeyboardEngine.js never
 * registered ctrl+n at all, so Ctrl+N fell through to the browser's
 * native "open new window" shortcut. That registration is real and kept.
 *
 * KNOWN PLATFORM LIMITATION, confirmed live in real Firefox (not fixable
 * in page JS — see engines/KeyboardEngine.js ctrl+n comment): the browser
 * reserves Ctrl+N at the chrome/OS level and opens a new window/tab
 * REGARDLESS of e.preventDefault(). The "does not open a new browser
 * window" assertion below only proves the in-app handler fires correctly
 * under Playwright's automation — Playwright does not reproduce the real
 * browser-chrome shortcut interception, so it CANNOT catch this
 * limitation and must not be read as proof Ctrl+N is reliable in a real
 * browser tab. The menu/toolbar "Nuevo" click (first test below) is the
 * reliable path end users should use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

test('LIVE: Archivo > Nuevo (menu click) confirms, then clears the document to a blank canvas', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const before = await page.evaluate(() => DS.elements.length);
    assert.ok(before > 0, 'sanity: default document must start with elements');

    page.once('dialog', (dialog) => dialog.accept());
    await page.click('[data-menu="archivo"]');
    await page.waitForTimeout(150);
    await page.click('#dd-archivo [data-action="new"]');
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => ({ count: DS.elements.length, sectionCount: DS.sections.length, selectionSize: DS.selection.size }));
    assert.equal(after.count, 0, '"Nuevo" must clear all elements');
    assert.equal(after.selectionSize, 0, '"Nuevo" must clear the active selection');
    assert.ok(after.sectionCount >= 5, '"Nuevo" must still provide the standard 5 sections (rh/ph/det/pf/rf)');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Archivo > Nuevo (menu click) does nothing if the confirm() dialog is dismissed', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => DS.elements.length);

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.click('[data-menu="archivo"]');
    await page.waitForTimeout(150);
    await page.click('#dd-archivo [data-action="new"]');
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => DS.elements.length);
    assert.equal(after, before, 'dismissing the confirm() must leave the document untouched');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Ctrl+N fires the in-app handler (confirm() accepted) and resets the document (does not prove real-browser shortcut interception — see file header)', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const before = await page.evaluate(() => DS.elements.length);
    assert.ok(before > 0, 'sanity: default document must start with elements');
    const pagesBefore = browser.contexts()[0].pages().length;

    page.once('dialog', (dialog) => dialog.accept());
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(200);

    const pagesAfter = browser.contexts()[0].pages().length;
    const after = await page.evaluate(() => DS.elements.length);
    assert.equal(after, 0, 'Ctrl+N must clear all elements, same as the menu item (the in-app handler contract)');
    // Informational only — see file header. Playwright's automation
    // context does not open a real new window for Ctrl+N even without
    // any app-side handling, so pagesAfter==pagesBefore here is expected
    // regardless and is NOT evidence the real-browser limitation is fixed.
    assert.equal(pagesAfter, pagesBefore, 'sanity: no extra Playwright-controlled page was opened during this test run');
  } finally {
    await browser.close();
    await server.stop();
  }
});
