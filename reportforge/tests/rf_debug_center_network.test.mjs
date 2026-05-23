import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNetworkSnapshotPublic as buildNetworkSnapshot,
  clearNetworkSnapshot,
  copyNetworkJSON,
  getNetworkSnapshot,
  installNetworkObserver,
  uninstallNetworkObserver,
} from '../../tools/rf-debug-center/rf-debug-center-network.js';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors } from './runtime_harness.mjs';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeFetchWin(fetchImpl) {
  return { location: { href: 'http://example.test/designer?rfDebugCenter=1', pathname: '/designer', search: '?rfDebugCenter=1', hash: '' }, fetch: fetchImpl, XMLHttpRequest: undefined, navigator: {}, setTimeout, clearTimeout };
}

class FakeXHR {
  constructor() { this._listeners = {}; this._headers = {}; this.responseType = ''; this.status = 0; this.responseText = ''; this.response = null; }
  addEventListener(type, handler) { (this._listeners[type] ||= []).push(handler); }
  _emit(type) { for (const handler of this._listeners[type] || []) handler.call(this); if (typeof this[`on${type}`] === 'function') this[`on${type}`].call(this); }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this._headers[name.toLowerCase()] = value; }
  getResponseHeader(name) { return this._responseHeaders?.[name.toLowerCase()] || null; }
  send(body) {
    this.body = body;
    this.status = 200;
    this._responseHeaders = { 'content-type': 'application/json' };
    this.responseText = JSON.stringify({ ok: true, password: 'secret' });
    this.response = JSON.parse(this.responseText);
    this._emit('loadend');
  }
}

function makeXhrWin(fetchImpl = async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } })) {
  return { location: { href: 'http://example.test/designer?rfDebugCenter=1', pathname: '/designer', search: '?rfDebugCenter=1', hash: '' }, fetch: fetchImpl, XMLHttpRequest: FakeXHR, navigator: {}, setTimeout, clearTimeout };
}

test('rf debug center network observer is safe without fetch or XMLHttpRequest', () => {
  clearNetworkSnapshot();
  const win = { location: { href: 'http://example.test/designer?rfDebugCenter=1', pathname: '/designer', search: '?rfDebugCenter=1', hash: '' }, navigator: {}, setTimeout, clearTimeout };
  const pure = buildNetworkSnapshot({ traceState: 'present' });
  assert.equal(pure.engine, 'network');
  const snapshot = installNetworkObserver(win);
  assert.equal(snapshot.status, 'unknown');
  assert.doesNotThrow(() => JSON.parse(copyNetworkJSON()));
  uninstallNetworkObserver(win);
});

test('rf debug center network fetch passthrough, sanitization, and clone fallback stay read-only', async () => {
  clearNetworkSnapshot();
  const win = makeFetchWin(async () => new Response(JSON.stringify({ ok: true, password: 'secret' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  installNetworkObserver(win);
  const response = await win.fetch('/designer-preview?token=abc', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer deadbeef' }, body: JSON.stringify({ password: 'secret', amount: 3, nested: { apiKey: 'hidden' } }) });
  assert.equal(await response.text(), '{"ok":true,"password":"secret"}');
  await flush();
  const snapshot = getNetworkSnapshot();
  assert.equal(snapshot.completedRequests.length, 1);
  assert.equal(snapshot.failedRequests.length, 0);
  assert.ok(snapshot.completedRequests[0].requestSummary.value.password === '[REDACTED]');
  assert.ok(snapshot.completedRequests[0].requestSummary.value.nested.apiKey === '[REDACTED]');
  assert.ok(snapshot.completedRequests[0].url.includes('/designer-preview'));
  assert.ok(snapshot.completedRequests[0].queryKeys.includes('token'));
  uninstallNetworkObserver(win);
  clearNetworkSnapshot();
});

test('rf debug center network fetch rejection and clone failure stay transparent', async () => {
  clearNetworkSnapshot();
  const cloneFail = {
    status: 200,
    ok: true,
    headers: { get: (name) => (name === 'content-type' ? 'text/plain' : null) },
    type: 'default',
    clone() { throw new Error('clone failed'); },
  };
  const win = makeFetchWin(async () => cloneFail);
  installNetworkObserver(win);
  const response = await win.fetch('/render', { method: 'POST', body: 'plain body' });
  assert.equal(response, cloneFail);
  await flush();
  assert.equal(getNetworkSnapshot().completedRequests[0].responseSummary.cloneSkipped, true);
  uninstallNetworkObserver(win);
  clearNetworkSnapshot();
  const rejectWin = makeFetchWin(async () => { throw new Error('network down'); });
  installNetworkObserver(rejectWin);
  await assert.rejects(() => rejectWin.fetch('/render', { method: 'POST' }), /network down/);
  await flush();
  assert.equal(getNetworkSnapshot().failedRequests.length >= 1, true);
  uninstallNetworkObserver(rejectWin);
  clearNetworkSnapshot();
});

test('rf debug center network xhr observer captures metadata and redacts sensitive fields', () => {
  clearNetworkSnapshot();
  const win = makeXhrWin();
  installNetworkObserver(win);
  const xhr = new win.XMLHttpRequest();
  xhr.open('POST', '/rf-audit?session=abc');
  xhr.send(JSON.stringify({ pass: 'secret', action: 'ping' }));
  const snapshot = getNetworkSnapshot();
  assert.equal(snapshot.completedRequests.length, 1);
  assert.equal(snapshot.completedRequests[0].method, 'POST');
  assert.equal(snapshot.completedRequests[0].responseSummary.value.ok, true);
  assert.equal(snapshot.completedRequests[0].responseSummary.value.password, '[REDACTED]');
  assert.ok(snapshot.completedRequests[0].sensitiveFieldsRedacted.length >= 1);
  uninstallNetworkObserver(win);
  clearNetworkSnapshot();
});

test('rf debug center network bundle integration and live runtime stay read-only', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());
  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await enterPreview(page);
    await page.evaluate(() => window.RFDebugCenter.clearNetwork());
    const before = await page.evaluate(() => ({
      traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
      ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview } : null,
    }));
    await page.evaluate(async () => {
      await fetch(location.href, { cache: 'no-store' });
      const xhr = new XMLHttpRequest();
      await new Promise((resolve, reject) => {
        xhr.open('GET', location.href, true);
        xhr.onload = () => resolve();
        xhr.onerror = reject;
        xhr.send();
      });
      return true;
    });
    await page.waitForFunction(() => (window.RFDebugCenter?.getState?.()?.network?.completedRequests?.length || 0) >= 1);
    const result = await page.evaluate(() => {
      const state = window.RFDebugCenter.getState();
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        network: state.network,
        traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
        ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview } : null,
        copy: window.RFDebugCenter.copyNetworkJSON(),
        bundle: window.RFDebugCenter.buildBundle(),
        panel: { status: text('rf-debug-center-network-status'), meta: text('rf-debug-center-network-meta'), body: text('rf-debug-center-network-body') },
      };
    });
    assert.ok(result.network.completedRequests.length >= 1);
    assert.match(result.panel.status, /(ok|info|warning|error|unknown)/);
    assert.equal(result.traceLength, before.traceLength);
    assert.deepEqual(result.ds, before.ds);
    assert.doesNotThrow(() => JSON.parse(result.copy));
    assert.ok(result.bundle.network);
    await assertNoConsoleErrors(consoleErrors, 'rf debug center network live runtime');
  } finally {
    await browser.close();
    await server.stop();
  }
});
