/**
 * sql_connection_modal.test.mjs
 *
 * Unit tests for SQLModal (Phase 8).
 * No server, no DOM, no browser.
 *
 * §1  open() adds modal to DOM (idempotent)
 * §2  close() removes modal from DOM (idempotent)
 * §3  _handleTest: missing required fields → error status
 * §4  _handleTest: fetch POST /datasources/_test → shows ok/error
 * §5  _handleSave: missing alias → error status
 * §6  _handleSave: missing server fields → error status
 * §7  _handleSave: fetch POST /datasources/{alias}/connect → shows ok/error
 * §8  Security: password NOT in fetch body key names (body carries value, not key)
 * §9  Security: password value goes to request body only (never to URL/headers)
 * §10 DocumentLoadModal datasource selector: populated from GET /datasources
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SQL_SRC = fs.readFileSync(resolve(ROOT, 'engines/SQLModal.js'), 'utf8');
const DLM_SRC = fs.readFileSync(resolve(ROOT, 'engines/DocumentLoadModal.js'), 'utf8');

// ── MockDOM (same pattern as document_load_modal.test.mjs) ────────────────────

class MockElement {
  constructor(tag) {
    this.tag         = tag.toUpperCase();
    this.tagName     = tag.toUpperCase();   // required for keydown target checks
    this.id          = '';
    this.className   = '';
    this.textContent = '';
    this.innerHTML   = '';
    this.value       = '';
    this.style       = { cssText: '' };
    this._attrs      = {};
    this._listeners  = {};
    this._children   = [];
    this._parent     = null;
  }
  setAttribute(k, v)  { this._attrs[k] = v; }
  getAttribute(k)     { return this._attrs[k] ?? null; }
  appendChild(el) {
    if (el && el._parent) el._parent._children = el._parent._children.filter(c => c !== el);
    el._parent = this;
    this._children.push(el);
    return el;
  }
  removeChild(el) {
    this._children = this._children.filter(c => c !== el);
    if (el) el._parent = null;
    return el;
  }
  remove() { if (this._parent) this._parent.removeChild(this); }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  _fire(event, ...args) { (this._listeners[event] || []).forEach(fn => fn(...args)); }
  focus() {}
  querySelector(sel) { return this._queryAll(sel)[0] || null; }
  _queryAll(sel) {
    const results = [];
    const walk = (node) => {
      if (!node || node === this) {}
      else {
        if (sel.startsWith('#') && node.id === sel.slice(1)) results.push(node);
        else if (!sel.startsWith('#') && !sel.startsWith('.') && node.tag === sel.toUpperCase()) results.push(node);
        else if (sel.startsWith('.') && (node.className||'').split(' ').includes(sel.slice(1))) results.push(node);
      }
      (node._children || []).forEach(walk);
    };
    this._children.forEach(walk);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this._idMap = {};
  }
  createElement(tag) {
    const el = new MockElement(tag);
    const self = this;
    Object.defineProperty(el, 'id', {
      get() { return el._id || ''; },
      set(v) { el._id = v; if (v) self._idMap[v] = el; },
    });
    return el;
  }
  getElementById(id) { return this._idMap[id] || null; }
}

// ── Fixture factory ────────────────────────────────────────────────────────────

function _loadSQLModal({ fetchImpl = null } = {}) {
  const doc = new MockDocument();
  const ctx = {
    window: { document: doc },
    globalThis: undefined,
    module: { exports: {} },
  };
  if (fetchImpl) ctx.window.fetch = fetchImpl;
  ctx.window.globalThis = ctx.window;
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(SQL_SRC, ctx);
  return { modal: ctx.window.SQLModal, doc };
}

function _root(doc)     { return doc.body._children[0] || null; }
function _find(doc, id) { const r = _root(doc); return r ? r.querySelector('#' + id) : null; }

function _statusType(doc) { return _find(doc, 'sqlm-status')?.getAttribute('data-status-type'); }
function _statusText(doc) { return _find(doc, 'sqlm-status')?.textContent || ''; }

function _setField(doc, id, val) { const el = _find(doc, id); if (el) el.value = val; }
function _click(doc, id) { const el = _find(doc, id); if (el) el._fire('click'); }

function _fireKeydown(doc, targetId, key) {
  const root   = _root(doc);
  if (!root) return { prevented: [] };
  const target = _find(doc, targetId);
  const prevented = [];
  root._fire('keydown', { key, target, preventDefault: () => prevented.push(true) });
  return { prevented };
}

// ── §1 — open() ──────────────────────────────────────────────────────────────

test('§1 open() adds modal to document.body', () => {
  const { modal, doc } = _loadSQLModal();
  assert.equal(doc.body._children.length, 0);
  modal.open();
  assert.equal(doc.body._children.length, 1);
});

test('§1 modal root has id="sql-modal"', () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  assert.equal(_root(doc).id, 'sql-modal');
});

test('§1 open() is idempotent — second call does not add second modal', () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  modal.open();
  assert.equal(doc.body._children.length, 1);
});

// ── §2 — close() ─────────────────────────────────────────────────────────────

test('§2 close() removes modal from document.body', () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  modal.close();
  assert.equal(doc.body._children.length, 0);
});

test('§2 close() without open() does not throw', () => {
  const { modal } = _loadSQLModal();
  assert.doesNotThrow(() => modal.close());
});

test('§2 open() after close() works', () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  modal.close();
  modal.open();
  assert.equal(doc.body._children.length, 1);
});

// ── §3 — Test: missing required fields ────────────────────────────────────────

test('§3 test with empty host → error status', async () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  _setField(doc, 'sqlm-host', '');
  _setField(doc, 'sqlm-db', 'SBO');
  _setField(doc, 'sqlm-user', 'sa');
  _setField(doc, 'sqlm-pass', 'pw');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(_statusType(doc), 'error');
});

test('§3 test with empty password → error status', async () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', '');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(_statusType(doc), 'error');
});

// ── §4 — Test: fetch POST /datasources/_test ─────────────────────────────────

test('§4 successful test → status ok with message', async () => {
  const fetchCalls = [];
  const fakeResult = { ok: true, message: 'Conectado a srv/DB', latency_ms: 12.3 };
  const fetchImpl = async (url, opts) => {
    fetchCalls.push({ url, opts });
    return { json: async () => fakeResult };
  };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'sa');
  _setField(doc, 'sqlm-pass', 'pw');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(_statusType(doc), 'ok');
  assert.ok(_statusText(doc).includes('Conectado'), `Expected success message, got: ${_statusText(doc)}`);
  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].url.includes('/_test'), 'Must POST to /datasources/_test');
});

test('§4 failed test → status error with message', async () => {
  const fakeResult = { ok: false, message: 'No se pudo conectar', latency_ms: 5.0 };
  const fetchImpl = async () => ({ json: async () => fakeResult });

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'bad-host');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'p');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(_statusType(doc), 'error');
  assert.ok(_statusText(doc).includes('No se pudo'), `Got: ${_statusText(doc)}`);
});

test('§4 network error → status error', async () => {
  const fetchImpl = async () => { throw new Error('Network timeout'); };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'p');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(_statusType(doc), 'error');
});

// ── §5 — Save: missing alias ──────────────────────────────────────────────────

test('§5 save with empty alias → error status', async () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  _setField(doc, 'sqlm-alias', '');
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'p');
  _click(doc, 'sqlm-save');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(_statusType(doc), 'error');
});

// ── §6 — Save: missing server fields ─────────────────────────────────────────

test('§6 save with alias but missing host → error status', async () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  _setField(doc, 'sqlm-alias', 'sap_b1');
  _setField(doc, 'sqlm-host', '');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'p');
  _click(doc, 'sqlm-save');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(_statusType(doc), 'error');
});

// ── §7 — Save: fetch POST /datasources/{alias}/connect ───────────────────────

test('§7 successful save → ok status with alias in message', async () => {
  const fetchCalls = [];
  const fakeResult = { alias: 'sap_b1', registered: true, reachable: true };
  const fetchImpl = async (url, opts) => {
    fetchCalls.push({ url, opts });
    return { json: async () => fakeResult };
  };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-alias', 'sap_b1');
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'SBO');
  _setField(doc, 'sqlm-user', 'sa');
  _setField(doc, 'sqlm-pass', 'pw');
  _click(doc, 'sqlm-save');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(_statusType(doc), 'ok');
  assert.ok(_statusText(doc).includes('sap_b1'), `Expected alias in message, got: ${_statusText(doc)}`);
  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].url.includes('/datasources/sap_b1/connect'), 'Must POST to correct URL');
});

test('§7 save with registered=false → error status', async () => {
  const fakeResult = { registered: false, message: 'Conflict' };
  const fetchImpl = async () => ({ json: async () => fakeResult });

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-alias', 'x');
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'p');
  _click(doc, 'sqlm-save');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(_statusType(doc), 'error');
});

// ── §8 — Security: password in request body, not URL ─────────────────────────

test('§8 test: password NOT appended to request URL', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url });
    return { json: async () => ({ ok: true, message: 'ok', latency_ms: 1 }) };
  };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'secret_pw');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 10));

  assert.ok(calls.length > 0, 'fetch should have been called');
  const fetchedUrl = calls[0].url;
  assert.ok(!fetchedUrl.includes('secret_pw'), 'Password must NOT appear in the request URL');
});

test('§8 save: password NOT appended to request URL', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url });
    return { json: async () => ({ alias: 'a', registered: true, reachable: false }) };
  };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-alias', 'a');
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'secret_pw');
  _click(doc, 'sqlm-save');
  await new Promise(r => setTimeout(r, 10));

  assert.ok(calls.length > 0);
  assert.ok(!calls[0].url.includes('secret_pw'), 'Password must NOT appear in the request URL');
});

// ── §9 — Security: password in body, not headers ─────────────────────────────

test('§9 test: password value NOT in Content-Type or other headers', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts?.headers || {} });
    return { json: async () => ({ ok: false, message: 'fail', latency_ms: 1 }) };
  };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'super_secret');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 10));

  const headers = JSON.stringify(calls[0]?.headers || {});
  assert.ok(!headers.includes('super_secret'), 'Password must NOT appear in request headers');
});

// ── §11 — Enter key on inputs triggers test ───────────────────────────────────

test('§11 Enter in password field triggers handleTest → fetch called', async () => {
  const fetchCalls = [];
  const fakeResult = { ok: true, message: 'Conectado', latency_ms: 5 };
  const fetchImpl = async (url, opts) => { fetchCalls.push({ url, opts }); return { json: async () => fakeResult }; };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'pw');
  _fireKeydown(doc, 'sqlm-pass', 'Enter');
  await new Promise(r => setTimeout(r, 10));

  assert.ok(fetchCalls.length > 0, 'Enter in password must trigger handleTest → fetch');
  assert.equal(_statusType(doc), 'ok');
});

test('§11 Enter in host field also triggers handleTest', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, opts) => { fetchCalls.push({ url, opts }); return { json: async () => ({ ok: false, message: 'fail', latency_ms: 1 }) }; };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'pw');
  _fireKeydown(doc, 'sqlm-host', 'Enter');
  await new Promise(r => setTimeout(r, 10));

  assert.ok(fetchCalls.length > 0, 'Enter in any input must trigger test');
});

test('§11 Enter calls preventDefault', () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  const { prevented } = _fireKeydown(doc, 'sqlm-pass', 'Enter');
  assert.ok(prevented.length > 0, 'Enter must call preventDefault()');
});

test('§11 non-Enter keydown does NOT trigger test', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, opts) => { fetchCalls.push(url); return { json: async () => ({}) }; };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'pw');
  _fireKeydown(doc, 'sqlm-pass', 'Tab');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(fetchCalls.length, 0, 'Tab must not trigger test');
});

test('§11 click "Probar conexión" still works (regression)', async () => {
  const fetchCalls = [];
  const fakeResult = { ok: true, message: 'ok', latency_ms: 1 };
  const fetchImpl = async (url, opts) => { fetchCalls.push(url); return { json: async () => fakeResult }; };

  const { modal, doc } = _loadSQLModal({ fetchImpl });
  modal.open();
  _setField(doc, 'sqlm-host', 'srv');
  _setField(doc, 'sqlm-db', 'DB');
  _setField(doc, 'sqlm-user', 'u');
  _setField(doc, 'sqlm-pass', 'pw');
  _click(doc, 'sqlm-test');
  await new Promise(r => setTimeout(r, 10));

  assert.ok(fetchCalls.length > 0, 'Click must still trigger test');
  assert.equal(_statusType(doc), 'ok');
});

// ── §12 — Status log: selectable / copyable ───────────────────────────────────

test('§12 status element has user-select:text in style', () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  const statusEl = _find(doc, 'sqlm-status');
  assert.ok(statusEl, 'sqlm-status must exist');
  const css = statusEl.style.cssText || '';
  assert.ok(css.includes('user-select:text'), `Expected user-select:text in style, got: "${css}"`);
});

test('§12 status element has cursor:text in style', () => {
  const { modal, doc } = _loadSQLModal();
  modal.open();
  const statusEl = _find(doc, 'sqlm-status');
  assert.ok(statusEl, 'sqlm-status must exist');
  const css = statusEl.style.cssText || '';
  assert.ok(css.includes('cursor:text'), `Expected cursor:text in style, got: "${css}"`);
});

// ── §10 — DocumentLoadModal datasource selector ───────────────────────────────

function _loadDLM({ fetchImpl = null } = {}) {
  const doc = new MockDocument();
  const DS = { previewMode: false, _sampleData: null };
  const ctx = {
    window: {
      document: doc,
      DS,
      PreviewEngineRenderer: { refresh() {} },
      DocumentDataProvider: { load: async () => ({ ok: true }) },
    },
    globalThis: undefined,
    module: { exports: {} },
  };
  if (fetchImpl) ctx.window.fetch = fetchImpl;
  ctx.window.globalThis = ctx.window;
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(DLM_SRC, ctx);
  return { modal: ctx.window.DocumentLoadModal, doc };
}

test('§10 DocumentLoadModal renders datasource select with id=dlm-datasource', () => {
  const { modal, doc } = _loadDLM();
  modal.open();
  const root = doc.body._children[0];
  const selEl = root ? root.querySelector('#dlm-datasource') : null;
  assert.ok(selEl, 'dlm-datasource select must exist in the modal');
});

test('§10 DocumentLoadModal datasource default option is "default"', () => {
  const { modal, doc } = _loadDLM();
  modal.open();
  const root = doc.body._children[0];
  const selEl = root ? root.querySelector('#dlm-datasource') : null;
  assert.ok(selEl, 'dlm-datasource must exist');
  const defaultOpt = selEl._children.find(c => c.value === 'default');
  assert.ok(defaultOpt, '"default" option must be present');
});

test('§10 DocumentLoadModal fetches /datasources on open when fetch is available', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    return { json: async () => [{ alias: 'sap_prod', type: 'db', hint: 'host/SBO' }] };
  };

  const { modal, doc } = _loadDLM({ fetchImpl });
  modal.open();
  await new Promise(r => setTimeout(r, 10));

  assert.ok(fetchCalls.some(u => u.includes('/datasources')), 'Must fetch /datasources on open');
});

test('§10 DocumentLoadModal open() works without fetch (no error)', () => {
  const { modal, doc } = _loadDLM();  // no fetchImpl
  assert.doesNotThrow(() => modal.open());
  assert.equal(doc.body._children.length, 1);
});
