/**
 * diagnostics_gesture_loader.test.mjs
 *
 * Verifies engines/DiagnosticsGestureLoader.js — the permanent, always-loaded
 * gesture that toggles the opt-in rf-bbox-ink diagnostic via a triple click
 * on the visible "Parámetros" text, without ever shipping the diagnostic
 * itself in the default HTML.
 *
 * Regression covered: the shell has TWO visible "Parámetros" nodes —
 * #panel-left .panel-title (the prominent header) and #ptab-params (a small
 * tab) — the gesture MUST fire from either, via a single document-level
 * capture listener + an own click-timestamp counter (not event.detail).
 *
 * §1 Triple click on .panel-title (the prominent header) off→on.
 * §2 Triple click on .panel-title again on→off, teardown + reload.
 * §3 Triple click on #ptab-params also works (second legitimate zone).
 * §4 Normal runtime (no gesture) never loads RfBboxInkDiagnostic.js.
 * §5 Activating twice never duplicates the diagnostic <script>.
 * §6 Missing every "Parámetros" node → attach logs, never throws.
 * §7 Three clicks slower than the 900ms window never accumulate.
 * §8 Script load failure → error toast, state reverted, never left "on" with nothing loaded.
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
    onerror: null,
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
    closest(sel) {
      let n = this;
      while (n) {
        if (_matches(n, sel)) return n;
        n = n.parent || null;
      }
      return null;
    },
    fire(ev, evt) { (this._listeners[ev] || []).forEach((fn) => fn(evt)); },
  };
  return el;
}

// minimal selector matcher: supports '#id', '.class', and comma-lists thereof
function _matches(el, sel) {
  return sel.split(',').map((s) => s.trim()).some((s) => {
    if (s.startsWith('#')) return el.id === s.slice(1);
    if (s.startsWith('.')) return (el.className || '').split(/\s+/).includes(s.slice(1));
    return false;
  });
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

// Which "Parámetros" node(s) exist: 'title' | 'tab' | 'both' | null (neither)
function makeCtx({ nodes = 'both' } = {}) {
  const registry = new Map();
  const docListeners = { click: [] };
  const doc = {
    _registry: registry,
    readyState: 'complete',
    getElementById(id) { return registry.get(id) || null; },
    querySelector(sel) {
      if (sel === '.panel-title') return [...registry.values()].find((e) => e.className === 'panel-title') || null;
      return null;
    },
    createElement(tag) { return makeElement(doc, tag); },
    addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  };
  doc.head = makeElement(doc, 'head');
  doc.body = makeElement(doc, 'body');

  if (nodes === 'tab' || nodes === 'both') {
    const tab = makeElement(doc, 'div');
    tab.id = 'ptab-params';
    tab.className = 'panel-tab';
    tab.textContent = 'Parámetros';
    registry.set('ptab-params', tab);
  }
  if (nodes === 'title' || nodes === 'both') {
    const title = makeElement(doc, 'div');
    title.id = 'panel-title-el';
    title.className = 'panel-title';
    title.textContent = 'Parámetros \n + ✎ × ↻';
    registry.set('panel-title-el', title);
  }

  const historyCalls = [];
  const timers = [];
  const ctx = {
    document: doc,
    location: { href: 'http://127.0.0.1:5001/', reload: () => { ctx.__reloaded = true; } },
    history: { replaceState: (...args) => historyCalls.push(args) },
    URL,
    localStorage: makeStorage(),
    requestAnimationFrame(fn) { fn(); return 0; },
    setTimeout(fn, _ms) { timers.push(fn); return timers.length; },
    console,
    __historyCalls: historyCalls,
    __reloaded: false,
    __flushTimers() { while (timers.length) timers.shift()(); },
    // dispatch a synthetic click as if it reached document's capture listener
    __clickOn(target) { (docListeners.click || []).forEach((fn) => fn({ target })); },
  };
  ctx.window = ctx;

  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'DiagnosticsGestureLoader.js' });
  return ctx;
}

function tripleClick(ctx, target) {
  ctx.__clickOn(target);
  ctx.__clickOn(target);
  ctx.__clickOn(target);
}

// ---------- §1/§2 the prominent header (.panel-title) ----------

test('triple click on .panel-title (the prominent visible header) activates the diagnostic', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  const title = ctx.document.getElementById('panel-title-el');
  assert.equal(L.isEnabled(), false);

  assert.doesNotThrow(() => tripleClick(ctx, title));

  assert.equal(L.isEnabled(), true);
  assert.ok(ctx.document.getElementById(L.SCRIPT_ID), 'diagnostic script should be injected');
  const lastUrl = ctx.__historyCalls.at(-1)[2];
  assert.match(lastUrl, /rf_bbox_ink=1/);
  assert.match(lastUrl, /rf_bbox_zoom=40/);
  assert.match(ctx.document.getElementById('rf-diag-toast').textContent, /activado/);
});

test('triple click on .panel-title again deactivates, tears down, and reloads', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  const title = ctx.document.getElementById('panel-title-el');
  tripleClick(ctx, title);
  assert.equal(L.isEnabled(), true);

  const ui = ctx.document.createElement('div'); ui.id = 'rf-bbox-ui';
  ctx.document.body.appendChild(ui);
  const layer = ctx.document.createElement('div'); layer.id = 'rf-bbox-ink-layer';
  ctx.document.body.appendChild(layer);

  assert.doesNotThrow(() => tripleClick(ctx, title));

  assert.equal(L.isEnabled(), false);
  assert.equal(ctx.document.getElementById('rf-bbox-ui'), null);
  assert.equal(ctx.document.getElementById('rf-bbox-ink-layer'), null);
  assert.doesNotMatch(ctx.__historyCalls.at(-1)[2], /rf_bbox_ink/);
  assert.match(ctx.document.getElementById('rf-diag-toast').textContent, /desactivado/);

  ctx.__flushTimers();
  assert.equal(ctx.__reloaded, true);
});

// ---------- §3 the other zone (#ptab-params) must ALSO work ----------

test('triple click on #ptab-params (the tab) also activates the diagnostic', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  const tab = ctx.document.getElementById('ptab-params');
  tripleClick(ctx, tab);
  assert.equal(L.isEnabled(), true);
  assert.ok(ctx.document.getElementById(L.SCRIPT_ID));
});

// ---------- §4 normal runtime never loads the diagnostic ----------

test('normal runtime (no gesture) never loads RfBboxInkDiagnostic.js', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  assert.equal(L.isEnabled(), false);
  assert.equal(ctx.document.getElementById(L.SCRIPT_ID), null);
});

// ---------- §5 idempotent: no duplicate script ----------

test('activating twice never duplicates the diagnostic script tag', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  L.activate();
  L.activate();
  const matches = ctx.document.head.children.filter((c) => c.id === L.SCRIPT_ID);
  assert.equal(matches.length, 1);
});

// ---------- §6 missing every "Parámetros" node ----------

test('missing every "Parámetros" node → attach logs and never throws', () => {
  const ctx = makeCtx({ nodes: null });
  const L = ctx.DiagnosticsGestureLoader;
  assert.equal(L.hasAnyParamsNode(), false);
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  try {
    assert.doesNotThrow(() => L.attach());
  } finally {
    console.warn = origWarn;
  }
  assert.ok(warnings.some((w) => w.includes('RF_DIAG_GESTURE_TARGET_NOT_FOUND')));
});

// ---------- §7 own counter respects the 900ms window ----------

test('three clicks slower than the 900ms window never accumulate into a toggle', () => {
  // Date must be mocked INSIDE the vm context — the sandbox has its own
  // realm, so overriding the host's Date.now would never reach the code
  // under test (it calls the context-global Date.now(), not the host's).
  let t = 0;
  const ctx = makeCtx();
  ctx.Date = { now: () => t };
  const L = ctx.DiagnosticsGestureLoader;
  const title = ctx.document.getElementById('panel-title-el');
  ctx.__clickOn(title); t += 1000; // gap exceeds CLICK_WINDOW_MS (900) -> counter resets
  ctx.__clickOn(title); t += 1000;
  ctx.__clickOn(title);
  assert.equal(L.isEnabled(), false);
  assert.equal(ctx.document.getElementById(L.SCRIPT_ID), null);
});

// ---------- §8 script load failure ----------

test('script load failure shows an error toast and reverts state', () => {
  const ctx = makeCtx();
  const L = ctx.DiagnosticsGestureLoader;
  L.activate();
  const script = ctx.document.getElementById(L.SCRIPT_ID);
  assert.ok(script);
  assert.doesNotThrow(() => script.onerror());
  assert.equal(L.isEnabled(), false);
  assert.equal(ctx.document.getElementById(L.SCRIPT_ID), null);
  assert.match(ctx.document.getElementById('rf-diag-toast').textContent, /No pude cargar/);
});
