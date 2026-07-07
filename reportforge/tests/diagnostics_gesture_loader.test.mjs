/**
 * diagnostics_gesture_loader.test.mjs
 *
 * Verifies engines/DiagnosticsGestureLoader.js — the permanent, always-loaded
 * gesture that toggles the opt-in rf-bbox-ink diagnostic via a triple click
 * on the "Parámetros" header, without ever shipping the diagnostic itself
 * in the default HTML.
 *
 * §1 Triple click off→on: activates, persists state, sets URL params, no throw.
 * §2 Triple click on→off: deactivates, clears state, cleans URL, tears down DOM.
 * §3 Normal runtime (no gesture) never loads RfBboxInkDiagnostic.js.
 * §4 Activating twice never duplicates the diagnostic <script>.
 * §5 Missing "Parámetros" node → attach/init fail silently, never throw.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.resolve(ROOT, 'engines/DiagnosticsGestureLoader.js'), 'utf8');

// ---------- fake DOM ----------

function makeElement(doc, tag) {
  const el = {
    tagName: tag,
    id: '',
    className: '',
    textContent: '',
    style: {},
    parent: null,
    children: [],
    _listeners: {},
    addEventListener(ev, fn) {
      (this._listeners[ev] = this._listeners[ev] || []).push(fn);
    },
    removeEventListener() {},
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      if (child.id) doc._registry.set(child.id, child);
      return child;
    },
    remove() {
      if (this.id) doc._registry.delete(this.id);
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
      }
    },
    querySelector() { return null; },
    fire(ev, evt) { (this._listeners[ev] || []).forEach((fn) => fn(evt)); },
  };
  return el;
}

function makeStorage() {
  const store = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    _store: store,
  };
}

// header: 'ptab-params' | 'panel-title' | null (missing entirely)
function makeCtx({ header = 'ptab-params' } = {}) {
  const registry = new Map();
  const doc = {
    _registry: registry,
    readyState: 'complete',
    getElementById(id) { return registry.get(id) || null; },
    querySelector(sel) {
      if (sel === '.panel-title' && header === 'panel-title') return registry.get('panel-title-el') || null;
      return null;
    },
    createElement(tag) { return makeElement(doc, tag); },
    addEventListener() {},
  };
  doc.head = makeElement(doc, 'head');
  doc.body = makeElement(doc, 'body');

  if (header === 'ptab-params') {
    const tab = makeElement(doc, 'div');
    tab.id = 'ptab-params';
    tab.textContent = 'Parámetros';
    registry.set('ptab-params', tab);
  } else if (header === 'panel-title') {
    const title = makeElement(doc, 'div');
    title.id = 'panel-title-el';
    title.className = 'panel-title';
    title.textContent = 'Parámetros';
    registry.set('panel-title-el', title);
  }
  // header === null → nothing registered at all (simulates missing node)

  const historyCalls = [];
  const timers = [];
  const ctx = {
    document: doc,
    location: { href: 'http://127.0.0.1:5001/', reload: () => { ctx.__reloaded = true; } },
    history: { replaceState: (...args) => historyCalls.push(args) },
    URL,
    localStorage: makeStorage(),
    requestAnimationFrame(fn) { fn(); return 0; },
    // Timers are queued, not run inline — otherwise the toast's own delayed
    // removal would erase it before the test can inspect it. Tests that care
    // about deferred effects (e.g. the post-deactivate reload) call __flushTimers().
    setTimeout(fn, _ms) { timers.push(fn); return timers.length; },
    console,
    __historyCalls: historyCalls,
    __reloaded: false,
    __flushTimers() { while (timers.length) timers.shift()(); },
  };
  ctx.window = ctx;

  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'DiagnosticsGestureLoader.js' });
  return ctx;
}

function tripleClick(header) {
  header.fire('click', { detail: 3 });
}

// ---------- §1 off→on ----------

test('triple click on "Parámetros" activates the diagnostic (off→on)', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  assert.equal(L.isEnabled(), false);

  const header = ctx.document.getElementById('ptab-params');
  assert.doesNotThrow(() => tripleClick(header));

  assert.equal(L.isEnabled(), true);
  const script = ctx.document.getElementById(L.SCRIPT_ID);
  assert.ok(script, 'diagnostic script element should be injected');
  assert.equal(script.src, L.SCRIPT_SRC);
  assert.ok(ctx.__historyCalls.length >= 1, 'URL should be updated via history.replaceState');
  const lastUrl = ctx.__historyCalls.at(-1)[2];
  assert.match(lastUrl, /rf_bbox_ink=1/);
  assert.match(lastUrl, /rf_bbox_zoom=40/);
  const toast = ctx.document.getElementById('rf-diag-toast');
  assert.ok(toast, 'activation toast should render');
  assert.match(toast.textContent, /activado/);
});

// ---------- §2 on→off ----------

test('triple click again deactivates the diagnostic (on→off)', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  const header = ctx.document.getElementById('ptab-params');

  tripleClick(header); // on
  assert.equal(L.isEnabled(), true);

  // simulate the diagnostic having built its own DOM while active
  const ui = ctx.document.createElement('div'); ui.id = 'rf-bbox-ui';
  ctx.document.body.appendChild(ui);
  const layer = ctx.document.createElement('div'); layer.id = 'rf-bbox-ink-layer';
  ctx.document.body.appendChild(layer);

  assert.doesNotThrow(() => tripleClick(header)); // off

  assert.equal(L.isEnabled(), false);
  assert.equal(ctx.document.getElementById('rf-bbox-ui'), null, 'diagnostic panel should be torn down');
  assert.equal(ctx.document.getElementById('rf-bbox-ink-layer'), null, 'diagnostic overlay layer should be torn down');
  const lastUrl = ctx.__historyCalls.at(-1)[2];
  assert.doesNotMatch(lastUrl, /rf_bbox_ink/);
  assert.doesNotMatch(lastUrl, /rf_bbox_zoom/);
  const toast = ctx.document.getElementById('rf-diag-toast');
  assert.ok(toast, 'deactivation toast should render');
  assert.match(toast.textContent, /desactivado/);

  ctx.__flushTimers();
  assert.equal(ctx.__reloaded, true, 'a loaded diagnostic must be cleared with a reload (no teardown API exists)');
});

// ---------- §3 normal runtime never loads the diagnostic ----------

test('normal runtime (no gesture) never loads RfBboxInkDiagnostic.js', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  assert.equal(L.isEnabled(), false);
  assert.equal(ctx.document.getElementById(L.SCRIPT_ID), null);
});

// ---------- §4 idempotent: no duplicate script ----------

test('activating twice never duplicates the diagnostic script tag', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  L.activate();
  L.activate();
  const matches = ctx.document.head.children.filter((c) => c.id === L.SCRIPT_ID);
  assert.equal(matches.length, 1, 'only one diagnostic <script> may exist');
});

// ---------- §5 missing "Parámetros" node ----------

test('missing "Parámetros" node → attach/init fail silently, never throw', () => {
  const ctx = makeCtx({ header: null });
  const L = ctx.DiagnosticsGestureLoader;
  assert.equal(ctx.document.getElementById('ptab-params'), null);
  assert.doesNotThrow(() => L.init());
  assert.equal(L.attach(), false);
});

test('falls back to .panel-title when #ptab-params is absent', () => {
  const ctx = makeCtx({ header: 'panel-title' });
  const L = ctx.DiagnosticsGestureLoader;
  const header = ctx.document.querySelector('.panel-title');
  assert.ok(header);
  assert.doesNotThrow(() => tripleClick(header));
  assert.equal(L.isEnabled(), true);
});
