/**
 * document_load_modal.test.mjs
 *
 * Tests de contrato para DocumentLoadModal.
 * Sin servidor real. Sin DOM completo.
 * Todos los tests son unit — estado aislado por fixture mediante MockDOM.
 *
 * Escenarios cubiertos:
 *   §1  open() agrega el modal al DOM (document.body)
 *   §2  close() remueve el modal del DOM
 *   §3  número vacío → muestra INVALID_DOC_NUMBER en status
 *   §4  número negativo → muestra INVALID_DOC_NUMBER en status
 *   §5  tipo inválido → muestra INVALID_DOC_TYPE en status
 *   §6  click Cargar → llama DocumentDataProvider.load() con tipo y número correctos
 *   §7  resultado ok → muestra mensaje de éxito en status
 *   §8  resultado error → muestra error.code y error.message en status
 *   §9  UI NO asigna DS._sampleData directamente
 *   §10 UI NO llama PreviewEngineRenderer.refresh() directamente
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC  = fs.readFileSync(resolve(ROOT, 'engines/DocumentLoadModal.js'), 'utf8');

// ── Minimal DOM mock ──────────────────────────────────────────────────────────

class MockElement {
  constructor(tag) {
    this.tag          = tag.toUpperCase();
    this.id           = '';
    this.className    = '';
    this.textContent  = '';
    this.innerHTML    = '';
    this.value        = '';
    this.style        = { cssText: '' };
    this._attrs       = {};
    this._listeners   = {};
    this._children    = [];
    this._parent      = null;
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
  remove() {
    if (this._parent) this._parent.removeChild(this);
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  _fire(event) {
    (this._listeners[event] || []).forEach(fn => fn());
  }
  focus() {}
  // Simple querySelector: handles #id and tag selectors
  querySelector(sel) {
    return this._queryAll(sel)[0] || null;
  }
  _queryAll(sel) {
    const results = [];
    const walk = (node) => {
      if (!node || node === this) { /* skip root */ }
      else {
        if (sel.startsWith('#') && node.id === sel.slice(1)) results.push(node);
        else if (!sel.startsWith('#') && !sel.startsWith('.') && node.tag === sel.toUpperCase()) results.push(node);
        else if (sel.startsWith('.') && (node.className || '').split(' ').includes(sel.slice(1))) results.push(node);
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
    // Intercept id assignment to register in idMap
    const self = this;
    Object.defineProperty(el, 'id', {
      get() { return el._id || ''; },
      set(v) {
        el._id = v;
        if (v) self._idMap[v] = el;
      },
    });
    return el;
  }
  getElementById(id) {
    return this._idMap[id] || null;
  }
}

// ── Fixture factory ───────────────────────────────────────────────────────────

function _load({ providerResult = { ok: true, dataset: {} }, providerErr = null } = {}) {
  const load_calls = [];
  const refresh_calls = [];
  const ds_assignments = [];

  const mockDoc = new MockDocument();

  // Track DS._sampleData assignments
  let _sampleDataValue = null;
  const DS = {
    previewMode: false,
    get _sampleData() { return _sampleDataValue; },
    set _sampleData(v) {
      ds_assignments.push(v);
      _sampleDataValue = v;
    },
  };

  const PreviewEngineRenderer = {
    refresh() { refresh_calls.push(1); },
  };

  const DocumentDataProvider = {
    load: async (type, num) => {
      load_calls.push({ type, num });
      if (providerErr) throw providerErr;
      return providerResult;
    },
  };

  const ctx = {
    window: {
      document: mockDoc,
      DS,
      PreviewEngineRenderer,
      DocumentDataProvider,
    },
    globalThis: undefined,
    module: { exports: {} },
  };
  ctx.window.globalThis = ctx.window;
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);

  const modal = ctx.window.DocumentLoadModal;
  return { modal, mockDoc, DS, load_calls, refresh_calls, ds_assignments };
}

// Helper: get the current modal root in document.body (first child)
function _getModalRoot(mockDoc) {
  return mockDoc.body._children[0] || null;
}

// Helper: find #dlm-* elements inside the modal
function _find(mockDoc, id) {
  const root = _getModalRoot(mockDoc);
  return root ? root.querySelector('#' + id) : null;
}

// Helper: trigger load click with specific type/number
async function _clickLoad(mockDoc, type, numStr) {
  const typeEl = _find(mockDoc, 'dlm-type');
  const numEl  = _find(mockDoc, 'dlm-num');
  if (typeEl) typeEl.value = type;
  if (numEl)  numEl.value  = numStr;
  const loadBtn = _find(mockDoc, 'dlm-load');
  if (loadBtn) {
    loadBtn._fire('click');
    // Allow the async _handleLoad to complete
    await new Promise(r => setTimeout(r, 0));
  }
}

function _getStatusType(mockDoc) {
  const el = _find(mockDoc, 'dlm-status');
  return el ? el.getAttribute('data-status-type') : null;
}

function _getStatusText(mockDoc) {
  const el = _find(mockDoc, 'dlm-status');
  return el ? el.textContent : '';
}

// ── §1 — open() agrega modal al DOM ──────────────────────────────────────────

test('§1 open() agrega el modal a document.body', () => {
  const { modal, mockDoc } = _load();
  assert.equal(mockDoc.body._children.length, 0);
  modal.open();
  assert.equal(mockDoc.body._children.length, 1);
});

test('§1 modal tiene id="doc-load-modal"', () => {
  const { modal, mockDoc } = _load();
  modal.open();
  const root = _getModalRoot(mockDoc);
  assert.ok(root, 'modal root debe existir');
  assert.equal(root.id, 'doc-load-modal');
});

test('§1 open() es idempotente — segunda llamada no agrega segundo modal', () => {
  const { modal, mockDoc } = _load();
  modal.open();
  modal.open();
  assert.equal(mockDoc.body._children.length, 1);
});

// ── §2 — close() remueve el modal del DOM ────────────────────────────────────

test('§2 close() remueve el modal de document.body', () => {
  const { modal, mockDoc } = _load();
  modal.open();
  assert.equal(mockDoc.body._children.length, 1);
  modal.close();
  assert.equal(mockDoc.body._children.length, 0);
});

test('§2 close() sin open previo no lanza error', () => {
  const { modal } = _load();
  assert.doesNotThrow(() => modal.close());
});

test('§2 open() después de close() funciona correctamente', () => {
  const { modal, mockDoc } = _load();
  modal.open();
  modal.close();
  modal.open();
  assert.equal(mockDoc.body._children.length, 1);
});

// ── §3 — Número vacío → INVALID_DOC_NUMBER ───────────────────────────────────

test('§3 número vacío → data-status-type="error"', async () => {
  const { modal, mockDoc } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'factura', '');
  assert.equal(_getStatusType(mockDoc), 'error');
});

test('§3 número vacío → status contiene INVALID_DOC_NUMBER', async () => {
  const { modal, mockDoc } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'factura', '');
  assert.ok(_getStatusText(mockDoc).includes('INVALID_DOC_NUMBER'));
});

test('§3 número cero → INVALID_DOC_NUMBER', async () => {
  const { modal, mockDoc } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'factura', '0');
  assert.ok(_getStatusText(mockDoc).includes('INVALID_DOC_NUMBER'));
});

// ── §4 — Número negativo → INVALID_DOC_NUMBER ────────────────────────────────

test('§4 número negativo → INVALID_DOC_NUMBER', async () => {
  const { modal, mockDoc } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'factura', '-5');
  assert.ok(_getStatusText(mockDoc).includes('INVALID_DOC_NUMBER'));
});

test('§4 número no numérico → INVALID_DOC_NUMBER', async () => {
  const { modal, mockDoc } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'factura', 'abc');
  assert.ok(_getStatusText(mockDoc).includes('INVALID_DOC_NUMBER'));
});

// ── §5 — Tipo inválido → INVALID_DOC_TYPE ────────────────────────────────────

test('§5 tipo inválido → data-status-type="error"', async () => {
  const { modal, mockDoc } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'boleta', '12345');
  assert.equal(_getStatusType(mockDoc), 'error');
});

test('§5 tipo inválido → status contiene INVALID_DOC_TYPE', async () => {
  const { modal, mockDoc } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'boleta', '12345');
  assert.ok(_getStatusText(mockDoc).includes('INVALID_DOC_TYPE'));
});

// ── §6 — Click Cargar → llama DocumentDataProvider.load() ────────────────────

test('§6 click Cargar llama DocumentDataProvider.load()', async () => {
  const { modal, mockDoc, load_calls } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'factura', '12345');
  assert.equal(load_calls.length, 1);
});

test('§6 DocumentDataProvider.load() recibe el tipo correcto', async () => {
  const { modal, mockDoc, load_calls } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'remision', '42');
  assert.equal(load_calls[0].type, 'remision');
});

test('§6 DocumentDataProvider.load() recibe el número como entero positivo', async () => {
  const { modal, mockDoc, load_calls } = _load();
  modal.open();
  await _clickLoad(mockDoc, 'factura', '12345');
  assert.equal(load_calls[0].num, 12345);
});

// ── §7 — Resultado ok → muestra mensaje de éxito ─────────────────────────────

test('§7 resultado ok → data-status-type="success"', async () => {
  const { modal, mockDoc } = _load({ providerResult: { ok: true, dataset: {} } });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '42');
  assert.equal(_getStatusType(mockDoc), 'success');
});

test('§7 resultado ok → status contiene tipo y número', async () => {
  const { modal, mockDoc } = _load({ providerResult: { ok: true, dataset: {} } });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '42');
  const txt = _getStatusText(mockDoc);
  assert.ok(txt.includes('factura'), 'falta tipo en mensaje de éxito');
  assert.ok(txt.includes('42'), 'falta número en mensaje de éxito');
});

// ── §8 — Resultado error → muestra error.code y error.message ────────────────

test('§8 resultado error → data-status-type="error"', async () => {
  const { modal, mockDoc } = _load({
    providerResult: { ok: false, error: { code: 'DOC_NOT_FOUND', message: 'Documento no encontrado', details: '' } },
  });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '999');
  assert.equal(_getStatusType(mockDoc), 'error');
});

test('§8 resultado error → status contiene error.code', async () => {
  const { modal, mockDoc } = _load({
    providerResult: { ok: false, error: { code: 'DOC_NOT_FOUND', message: 'Documento no encontrado', details: '' } },
  });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '999');
  assert.ok(_getStatusText(mockDoc).includes('DOC_NOT_FOUND'));
});

test('§8 resultado error → status contiene error.message', async () => {
  const { modal, mockDoc } = _load({
    providerResult: { ok: false, error: { code: 'DB_TIMEOUT', message: 'Tiempo de espera agotado', details: '' } },
  });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '7');
  assert.ok(_getStatusText(mockDoc).includes('Tiempo de espera agotado'));
});

// ── §9 — UI NO asigna DS._sampleData directamente ────────────────────────────

test('§9 click Cargar exitoso NO asigna DS._sampleData desde la UI', async () => {
  const { modal, mockDoc, ds_assignments } = _load({
    providerResult: { ok: true, dataset: { meta: { doc_entry: 42 } } },
  });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '42');
  // DS._sampleData must not be set by the modal — that is DocumentDataProvider's job
  assert.equal(ds_assignments.length, 0, 'UI no debe asignar DS._sampleData directamente');
});

test('§9 click Cargar con error NO modifica DS._sampleData', async () => {
  const { modal, mockDoc, ds_assignments } = _load({
    providerResult: { ok: false, error: { code: 'DOC_NOT_FOUND', message: 'No encontrado', details: '' } },
  });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '999');
  assert.equal(ds_assignments.length, 0);
});

// ── §10 — UI NO llama PreviewEngineRenderer.refresh() ────────────────────────

test('§10 click Cargar exitoso NO llama PreviewEngineRenderer.refresh() desde la UI', async () => {
  const { modal, mockDoc, refresh_calls } = _load({
    providerResult: { ok: true, dataset: {} },
  });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '42');
  assert.equal(refresh_calls.length, 0, 'UI no debe llamar PreviewEngineRenderer.refresh() directamente');
});

test('§10 click Cargar con error NO llama PreviewEngineRenderer.refresh()', async () => {
  const { modal, mockDoc, refresh_calls } = _load({
    providerResult: { ok: false, error: { code: 'DOC_NOT_FOUND', message: 'No encontrado', details: '' } },
  });
  modal.open();
  await _clickLoad(mockDoc, 'factura', '1');
  assert.equal(refresh_calls.length, 0);
});
