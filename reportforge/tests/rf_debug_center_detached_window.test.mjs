import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startRuntimeServer, launchRuntimePage, assertNoConsoleErrors } from './runtime_harness.mjs';

function fileText(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('rf debug center detached window opens a real browser window contract', { timeout: 120000 }, async () => {
  const detachedSource = fileText('tools/rf-debug-center/rf-debug-center-detached-window.js');
  const apiSource = fileText('tools/rf-debug-center/rf-debug-center-api.js');
  const viewSource = fileText('tools/rf-debug-center/rf-debug-center-view.js');
  assert.match(detachedSource, /window\.open\(/);
  assert.match(detachedSource, /RFDebugCenterDetached/);
  assert.match(apiSource, /openDetachedWindow/);
  assert.match(apiSource, /closeDetachedWindow/);
  assert.match(apiSource, /syncDetachedWindow/);
  assert.match(apiSource, /getDetachedWindowState/);
  assert.match(viewSource, /rf-debug-center-open-window/);
  assert.match(viewSource, /Open Window/);

  const server = await startRuntimeServer();
  const url = new URL(server.baseUrl);
  url.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(url.toString());

  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await page.waitForTimeout(250);

    const surface = await page.evaluate(() => ({
      buttonExists: !!document.getElementById('rf-debug-center-root')?.shadowRoot?.getElementById('rf-debug-center-open-window'),
      api: {
        open: typeof window.RFDebugCenter?.openDetachedWindow === 'function',
        close: typeof window.RFDebugCenter?.closeDetachedWindow === 'function',
        sync: typeof window.RFDebugCenter?.syncDetachedWindow === 'function',
        state: typeof window.RFDebugCenter?.getDetachedWindowState === 'function',
      },
      uniqueGlobal: typeof window.RFDebugCenterDetached === 'undefined',
    }));
    assert.equal(surface.buttonExists, true);
    assert.deepEqual(surface.api, { open: true, close: true, sync: true, state: true });
    assert.equal(surface.uniqueGlobal, true);

    const baseline = await page.evaluate(() => ({
      ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview, previewMode: window.DS.previewMode } : null,
      traceLength: window.RF_UI_TRACE?.getEntries?.()?.length ?? 0,
    }));

    await page.evaluate(() => {
      window.__rfDetachedWindowCalls = [];
      window.__rfDetachedDocumentWrites = [];
      window.__rfDetachedFetchCalls = 0;
      window.__rfDetachedXhrCalls = 0;
      const originalFetch = window.fetch?.bind(window);
      window.fetch = async (...args) => {
        window.__rfDetachedFetchCalls += 1;
        return originalFetch ? originalFetch(...args) : Promise.reject(new Error('fetch unavailable'));
      };
      const originalXhrOpen = window.XMLHttpRequest?.prototype?.open;
      if (originalXhrOpen) {
        window.XMLHttpRequest.prototype.open = function (...args) {
          window.__rfDetachedXhrCalls += 1;
          return originalXhrOpen.apply(this, args);
        };
      }
      window.__rfDetachedChild = {
        closed: false,
        focus() { window.__rfDetachedWindowCalls.push(['focus']); },
        close() { this.closed = true; window.__rfDetachedWindowCalls.push(['child.close']); },
        addEventListener(type) { window.__rfDetachedWindowCalls.push(['child.listen', type]); },
        document: {
          open() { window.__rfDetachedWindowCalls.push(['document.open']); },
          write(html) { window.__rfDetachedDocumentWrites.push(html); window.__rfDetachedWindowCalls.push(['document.write']); },
          close() { window.__rfDetachedWindowCalls.push(['document.close']); },
        },
      };
      window.open = (...args) => {
        window.__rfDetachedOpenArgs = args;
        window.__rfDetachedWindowCalls.push(['window.open']);
        return window.__rfDetachedChild;
      };
    });

    await page.evaluate(() => document.getElementById('rf-debug-center-root')?.shadowRoot?.getElementById('rf-debug-center-open-window')?.click());
    await page.waitForTimeout(100);

    const opened = await page.evaluate(() => ({
      openArgs: window.__rfDetachedOpenArgs || null,
      writes: window.__rfDetachedDocumentWrites || [],
      calls: window.__rfDetachedWindowCalls || [],
      state: window.RFDebugCenter?.getDetachedWindowState?.() || null,
      ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview, previewMode: window.DS.previewMode } : null,
      traceLength: window.RF_UI_TRACE?.getEntries?.()?.length ?? 0,
      fetchCalls: window.__rfDetachedFetchCalls || 0,
      xhrCalls: window.__rfDetachedXhrCalls || 0,
    }));

    assert.ok(opened.openArgs, 'window.open must be called from the button click');
    assert.equal(opened.openArgs[0], 'about:blank');
    assert.equal(opened.openArgs[1], 'RFDebugCenterDetached');
    assert.match(opened.openArgs[2], /width=1200|width=11\d{2}|width=1[2-9]\d{2}/);
    assert.match(opened.openArgs[2], /height=850|height=8\d{2}/);
    assert.match(opened.openArgs[2], /resizable=yes/);
    assert.match(opened.openArgs[2], /scrollbars=yes/);
    assert.equal(opened.state.open, true);
    assert.equal(opened.state.closed, false);
    assert.equal(opened.state.popupBlocked, false);
    assert.ok(opened.writes[0]?.includes('<title>RF Debug Center</title>'));
    assert.ok(opened.writes[0]?.includes('Overview'));
    assert.ok(opened.writes[0]?.includes('Causal'));
    assert.ok(opened.writes[0]?.includes('Warnings'));
    assert.ok(opened.writes[0]?.includes('DOM Scanner'));
    assert.ok(opened.writes[0]?.includes('Bundle'));
    assert.ok(opened.writes[0]?.includes('Raw JSON'));
    assert.ok(opened.writes[0]?.includes('RF VISUAL DOCTOR CSS'));
    assert.ok(opened.writes[0]?.includes('VISUAL REGRESSION GUARD'));
    assert.ok(opened.writes[0]?.includes('SAFETY CONTRACT'));
    assert.deepEqual(opened.ds, baseline.ds);
    assert.equal(opened.traceLength, baseline.traceLength);
    assert.equal(opened.fetchCalls, 0);
    assert.equal(opened.xhrCalls, 0);

    const syncOnce = await page.evaluate(() => {
      const before = window.__rfDetachedWindowCalls.length;
      const state = window.RFDebugCenter.syncDetachedWindow();
      return { state, callCount: window.__rfDetachedWindowCalls.length - before, openArgs: window.__rfDetachedOpenArgs };
    });
    assert.equal(syncOnce.state.open, true);
    assert.equal(syncOnce.state.closed, false);
    assert.equal(syncOnce.callCount >= 1, true);
    assert.equal(syncOnce.openArgs[1], 'RFDebugCenterDetached');

    const closedChild = await page.evaluate(() => {
      window.__rfDetachedChild.closed = true;
      return window.RFDebugCenter.syncDetachedWindow();
    });
    assert.equal(closedChild.closed, true);
    assert.equal(closedChild.open, false);

    const popupBlocked = await page.evaluate(() => {
      window.open = () => null;
      return window.RFDebugCenter.openDetachedWindow();
    });
    assert.equal(popupBlocked.popupBlocked, true);
    assert.equal(popupBlocked.error, 'popup-blocked');

    await page.evaluate(() => {
      window.__rfDetachedChild = {
        closed: false,
        focus() {},
        close() { this.closed = true; window.__rfDetachedWindowCalls.push(['child.close']); },
        addEventListener() {},
        document: { open() {}, write() {}, close() {} },
      };
      window.open = () => window.__rfDetachedChild;
      window.RFDebugCenter.openDetachedWindow();
    });
    const closed = await page.evaluate(() => window.RFDebugCenter.closeDetachedWindow());
    assert.equal(closed.open, false);
    assert.equal(closed.closed, true);
    assert.equal(closed.popupBlocked, false);

    await assertNoConsoleErrors(consoleErrors, 'rf debug center detached window');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('rf debug center detached window stays absent without debug activation', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForTimeout(250);
    const snapshot = await page.evaluate(() => ({
      global: typeof window.RFDebugCenter === 'object',
      enabled: window.RFDebugCenter?.enabled ?? null,
      hostExists: !!document.getElementById('rf-debug-center-root'),
      detached: typeof window.RFDebugCenter?.getDetachedWindowState === 'function',
      detachedGlobal: typeof window.RFDebugCenterDetached,
    }));
    assert.equal(snapshot.global, true);
    assert.equal(snapshot.enabled, false);
    assert.equal(snapshot.hostExists, false);
    assert.equal(snapshot.detached, true);
    assert.equal(snapshot.detachedGlobal, 'undefined');
    await assertNoConsoleErrors(consoleErrors, 'rf debug center detached window disabled');
  } finally {
    await browser.close();
    await server.stop();
  }
});
