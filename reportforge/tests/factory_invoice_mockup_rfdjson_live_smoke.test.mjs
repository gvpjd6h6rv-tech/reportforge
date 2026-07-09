'use strict';
/**
 * FACTORY-MOCKUP-RFDJSON-EXPORT-01 — live smoke: the .rfd.json mockup must
 * load through the REAL "Abrir..." button (CommandRuntimeFileIO.load(),
 * the same code path a user drives), and attempting to load the .js source
 * it was extracted from must show a clear error instead of a raw JSON.parse
 * failure. 1 test = 1 responsibility (UDS 4.1 canonical rule).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRuntimeServer, launchRuntimePage, assertNoConsoleErrors, ROOT } from './runtime_harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKUP_JSON = path.join(ROOT, 'reportforge/layouts/factory_invoice_mockup.rfd.json');
const MOCKUP_JS = path.join(ROOT, 'engines/FactoryInvoiceMockupLayout.js');

async function openViaAbrirButton(page, filePath) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('button[data-action="open"]');
  const chooser = await fileChooserPromise;
  await chooser.setFiles(filePath);
  await page.waitForTimeout(800);
}

test('LIVE: factory_invoice_mockup.rfd.json loads via the real Abrir button', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await openViaAbrirButton(page, MOCKUP_JSON);
    const sectionsCount = await page.evaluate(() => window.DS.state.sections.length);
    assert.equal(sectionsCount, 5);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: factory_invoice_mockup.rfd.json loaded via Abrir button has 46 elements', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openViaAbrirButton(page, MOCKUP_JSON);
    const elementsCount = await page.evaluate(() => window.DS.state.elements.length);
    assert.equal(elementsCount, 46);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: factory_invoice_mockup.rfd.json load leaves no console errors', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await openViaAbrirButton(page, MOCKUP_JSON);
    await assertNoConsoleErrors(consoleErrors, 'factory_invoice_mockup.rfd.json load');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: attempting to load FactoryInvoiceMockupLayout.js (.js) via Abrir shows a friendly error, not a raw JSON.parse failure', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const dialogMessage = new Promise((resolve) => {
      page.once('dialog', async (dialog) => { resolve(dialog.message()); await dialog.accept(); });
    });
    await openViaAbrirButton(page, MOCKUP_JS);
    const message = await dialogMessage;
    assert.match(message, /es un archivo JavaScript, no un layout JSON/);
    assert.doesNotMatch(message, /Unexpected token/);
  } finally {
    await browser.close();
    await server.stop();
  }
});
