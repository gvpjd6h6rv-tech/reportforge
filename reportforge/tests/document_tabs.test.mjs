'use strict';
/**
 * RF-DOCUMENT-TABS-NEW-PARITY-1 — DocumentTabManager unit tests
 *
 * Tests run BEFORE implementation — all RED until DocumentTabManager.js exists.
 *
 * Design decisions encoded here (see comments per section):
 *
 *   NUEVO:   create() never asks confirm. Doc dirty stays in its tab — nada se pierde.
 *            confirm() solo aplica si una acción va a CERRAR/PERDER cambios (no es este caso).
 *
 *   ABRIR:   Abre SIEMPRE en tab nuevo (parity CR MDI: cada File→Open es una ventana/tab
 *            independiente). El tab activo no se reemplaza ni cuando está vacío.
 *            ⚠ PENDIENTE CONFIRMACIÓN USUARIO: si CR reemplaza tab vacío en lugar de crear
 *            tab nuevo, TAB-016/TAB-017 deberán actualizarse.
 *
 *   GUARDAR: handle, name y dirty-watermark son POR TAB.
 *            - save() usa el fileHandle del TAB ACTIVO.
 *            - markCurrentSaved() solo marca el tab activo.
 *            - Firefox download (sin fileHandle) marca el tab activo como guardado
 *              (el usuario eligió guardar esa copia, así que el doc ya no es dirty).
 *              NO afecta otros tabs.
 *
 * Test IDs: TAB-001 … TAB-020
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import path   from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ─── stubs ────────────────────────────────────────────────────────────────────

function makeDSState(overrides = {}) {
  return {
    sections:       [{ id: 's1', stype: 'det', label: 'Det', height: 14, visible: true }],
    elements:       [{ id: 'e1', type: 'field', sectionId: 's1', x: 0, y: 0, w: 100, h: 14, content: 'hello' }],
    selection:      new Set(),
    tool:           'pointer',
    zoom:           1.0,
    zoomDesign:     1.0,
    zoomPreview:    1.0,
    gridVisible:    true,
    snapToGrid:     true,
    previewMode:    false,
    pageMarginLeft: 0,
    pageMarginTop:  0,
    previewZoom:    1.0,
    clipboard:      [],
    history:        ['{}'],
    historyIndex:   0,
    _subs:          [],
    ...overrides,
  };
}

function makeEl(tag) {
  const node = {
    tagName:     tag,
    innerHTML:   '',
    textContent: '',
    _classes:    new Set(),
    dataset:     {},
    style:       {},
    children:    [],
    _listeners:  {},
    appendChild(ch)    { this.children.push(ch); },
    addEventListener(evt, fn) {
      this._listeners[evt] = (this._listeners[evt] || []);
      this._listeners[evt].push(fn);
    },
    classList: {
      add(c)        { node._classes.add(c); },
      remove(c)     { node._classes.delete(c); },
      toggle(c, v)  { v !== undefined ? (v ? node._classes.add(c) : node._classes.delete(c)) : (node._classes.has(c) ? node._classes.delete(c) : node._classes.add(c)); },
      contains(c)   { return node._classes.has(c); },
    },
  };
  return node;
}

function buildCtx(dsState = null) {
  const state = dsState || makeDSState();
  const tabsRowChildren = [];

  const mockTabsRow = {
    children: tabsRowChildren,
    appendChild(child) { child.parentNode = mockTabsRow; tabsRowChildren.push(child); },
    removeChild(child) { const i = tabsRowChildren.indexOf(child); if (i !== -1) tabsRowChildren.splice(i, 1); child.parentNode = null; },
    querySelector(sel) {
      const m = sel.match(/\[data-tab-id="([^"]+)"\]/);
      if (m) return tabsRowChildren.find(c => c.dataset?.tabId === m[1]) || null;
      if (sel === '.file-tab.active') return tabsRowChildren.find(c => c._classes.has('active')) || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.file-tab') return [...tabsRowChildren];
      return [];
    },
  };

  const ctx = {
    DS: {
      state,
      get sections()       { return state.sections; },
      get elements()       { return state.elements; },
      get historyIndex()   { return state.historyIndex; },
      setSections(ss, src) { state.sections = ss; },
      setElements(es, src) { state.elements = es; },
      clearSelectionState(src) { state.selection = new Set(); },
      setZoom(z)           { state.zoom = z; },
      setZoomDesign(z)     { state.zoomDesign = z; },
      setZoomPreview(z)    { state.zoomPreview = z; },
      setPageMarginLeft(v) { state.pageMarginLeft = v; },
      setPageMarginTop(v)  { state.pageMarginTop = v; },
      saveHistory()        { state.historyIndex += 1; state.history.push('{}'); },
      _docType:            'factura',
      _sampleData:         { empresa: { razon_social: 'TEST' } },
    },
    CommandRuntimeFile: {
      _currentLayout: {
        name: 'Factura Test', version: '1.0',
        pageWidth: 754, pageSize: 'A4', docType: 'factura', margins: null,
      },
      _currentLayoutFileHandle: null,
      _currentLayoutName() { return this._currentLayout.name; },
      _setFileHandle(h, n) {
        this._currentLayoutFileHandle = h;
        if (n) this._currentLayout.name = n;
      },
      toJSON() {
        return JSON.stringify({
          ...this._currentLayout,
          sections: ctx.DS.sections,
          elements: ctx.DS.elements,
        });
      },
    },
    SectionEngine:      { render() {} },
    SelectionEngine:    { clearSelection() {} },
    CanvasLayoutEngine: { update() {}, renderAll() {} },
    document: {
      getElementById(id) {
        if (id === 'tabs-row') return mockTabsRow;
        return null;
      },
      createElement(tag) { return makeEl(tag); },
    },
    _tabsRowChildren: tabsRowChildren,
    module: { exports: {} },
  };
  return ctx;
}

function loadTabManager(ctx) {
  const src = fs.readFileSync(path.join(ROOT, 'engines/DocumentTabManager.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ─── TAB-001: API surface ─────────────────────────────────────────────────────
test('TAB-001: DocumentTabManager exports required API', () => {
  const ctx = buildCtx();
  const TM = loadTabManager(ctx);
  for (const fn of ['create', 'activate', 'isCurrentDirty', 'markCurrentSaved',
                    'updateCurrent', 'getActive', 'getTabs', '_registerInitialTab']) {
    assert.equal(typeof TM[fn], 'function', `${fn} must be exported`);
  }
});

// ─── TAB-002: boot state ──────────────────────────────────────────────────────
test('TAB-002: _registerInitialTab() creates exactly 1 active tab', () => {
  const ctx = buildCtx();
  const TM = loadTabManager(ctx);
  TM._registerInitialTab();
  assert.equal(TM.getTabs().length, 1, 'exactly 1 tab after init');
  const active = TM.getActive();
  assert.ok(active, 'there must be an active tab');
  assert.equal(typeof active.id, 'string', 'tab id must be a string');
  assert.ok(active.id.length > 0, 'tab id must be non-empty');
});

// ─── TAB-003: create() adds DOM node ─────────────────────────────────────────
test('TAB-003: create() appends a new .file-tab DOM node to #tabs-row', () => {
  const ctx = buildCtx();
  const TM = loadTabManager(ctx);
  TM._registerInitialTab();
  const before = ctx._tabsRowChildren.length;
  TM.create();
  assert.equal(ctx._tabsRowChildren.length, before + 1, 'one more DOM tab must appear');
});

// ─── TAB-004: create() snapshots old doc ─────────────────────────────────────
test('TAB-004: create() snapshots current elements before clearing DS', () => {
  const state = makeDSState({
    elements: [{ id: 'e1', type: 'text', content: 'original-content' }],
  });
  const ctx = buildCtx(state);
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  TM.create();

  // DS must now be empty (new doc)
  assert.equal(ctx.DS.elements.length, 0, 'DS.elements must be [] for new tab');

  // old tab snapshot must have the original element
  const tabs   = TM.getTabs();
  const oldTab = tabs.find(t => t.id !== TM.getActive().id);
  assert.ok(oldTab, 'old tab record must still exist');
  assert.ok(
    Array.isArray(oldTab.snapshot?.elements) &&
    oldTab.snapshot.elements.some(e => e.content === 'original-content'),
    'old tab snapshot must preserve original elements',
  );
});

// ─── TAB-005: create() switches active tab ────────────────────────────────────
test('TAB-005: create() makes new tab active, old tab becomes inactive', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const firstId = TM.getActive().id;
  TM.create();
  assert.notEqual(TM.getActive().id, firstId, 'active tab id must change');
});

// ─── TAB-006: create() — NO confirm() — correction #1 ───────────────────────
test('TAB-006: create() NEVER asks confirm, even when current tab is dirty', () => {
  // A dirty tab means DS.historyIndex > _savedHistoryIndex.
  // create() must NOT block or throw — dirty doc is preserved in its snapshot.
  const state = makeDSState({ historyIndex: 5 });  // simulate heavily edited doc
  const ctx   = buildCtx(state);

  // Override confirm to throw if called — create() must NOT call it
  ctx.confirm = () => { throw new Error('create() must not call confirm()'); };
  ctx.window  = { confirm: ctx.confirm };

  const TM = loadTabManager(ctx);
  TM._registerInitialTab();

  // This must NOT throw
  assert.doesNotThrow(() => TM.create(), 'create() must complete without confirm');
});

// ─── TAB-007: activate() restores snapshot ───────────────────────────────────
test('TAB-007: activate(id) restores snapshot elements into DS', () => {
  const state = makeDSState({
    elements: [{ id: 'e1', type: 'text', content: 'tab1-content' }],
  });
  const ctx = buildCtx(state);
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;

  TM.create();  // new empty tab active
  // put something in new tab
  ctx.DS.state.elements = [{ id: 'e99', type: 'text', content: 'tab2-content' }];

  TM.activate(tab1Id);
  assert.ok(
    ctx.DS.elements.some(e => e.content === 'tab1-content'),
    'activating tab1 must restore its original elements',
  );
});

// ─── TAB-008: round-trip tab switching ───────────────────────────────────────
test('TAB-008: tab1→tab2→tab1→tab2 round-trip preserves both docs', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;

  TM.create();
  const tab2Id = TM.getActive().id;
  ctx.DS.state.elements = [{ id: 'e99', type: 'text', content: 'tab2-specific' }];

  TM.activate(tab1Id);  // tab1 gets hello from original state
  TM.activate(tab2Id);  // back to tab2
  assert.ok(
    ctx.DS.elements.some(e => e.content === 'tab2-specific'),
    'switching back to tab2 must restore tab2 elements',
  );
});

// ─── TAB-009: dirty watermark — clean after markCurrentSaved() ───────────────
test('TAB-009: isCurrentDirty() is false right after markCurrentSaved()', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  TM.markCurrentSaved();
  assert.equal(TM.isCurrentDirty(), false, 'must be clean after watermark');
});

// ─── TAB-010: dirty watermark — dirty after history advances ─────────────────
test('TAB-010: isCurrentDirty() is true after saveHistory() advances past watermark', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  TM.markCurrentSaved();        // watermark at historyIndex=0
  ctx.DS.state.historyIndex = 1;  // simulate edit
  assert.equal(TM.isCurrentDirty(), true, 'must be dirty after history advances');
});

// ─── TAB-011: dirty watermark is per-tab ─────────────────────────────────────
test('TAB-011: markCurrentSaved() only marks the ACTIVE tab, not other tabs', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;
  TM.markCurrentSaved();  // mark tab1 as saved

  TM.create();  // new tab2 active
  // tab2 has never been saved → dirty watermark at creation point
  // simulate a user edit on tab2
  ctx.DS.state.historyIndex = 3;

  // tab1 is clean, tab2 is dirty
  const tabs = TM.getTabs();
  const tab1 = tabs.find(t => t.id === tab1Id);
  assert.ok(tab1, 'tab1 must still exist');
  // tab1 watermark must be at its historyIndex (clean)
  assert.equal(tab1._savedHistoryIndex, tab1.snapshot?.historyIndex ?? 0,
    'tab1 watermark must not be changed by tab2 operations');
});

// ─── TAB-012: updateCurrent updates metadata ─────────────────────────────────
test('TAB-012: updateCurrent({ name }) updates tab record and CommandRuntimeFile', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  TM.updateCurrent({ name: 'Nueva Factura' });
  const active = TM.getActive();
  assert.equal(active.name, 'Nueva Factura', 'tab record must store updated name');
  assert.equal(
    ctx.CommandRuntimeFile._currentLayout.name,
    'Nueva Factura',
    'CommandRuntimeFile._currentLayout.name must be updated',
  );
});

// ─── TAB-013: zoom preserved per-tab ─────────────────────────────────────────
test('TAB-013: activate() restores zoom from snapshot', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;
  ctx.DS.state.zoom = 1.5;  // set zoom on tab1
  TM.create();               // snapshot tab1 with zoom=1.5, new tab starts at 1.0
  assert.equal(ctx.DS.state.zoom, 1.0, 'new tab starts at zoom=1.0');
  TM.activate(tab1Id);
  assert.equal(ctx.DS.state.zoom, 1.5, 'tab1 zoom=1.5 must be restored');
});

// ─── TAB-014: getTabs count ───────────────────────────────────────────────────
test('TAB-014: getTabs() returns all tabs including inactive ones', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  TM.create();
  TM.create();
  assert.equal(TM.getTabs().length, 3, '3 tabs after two create() calls');
});

// ─── TAB-015: fileHandle per-tab ─────────────────────────────────────────────
test('TAB-015: updateCurrent({ fileHandle }) stores fileHandle in active tab record', () => {
  const ctx    = buildCtx();
  const TM     = loadTabManager(ctx);
  TM._registerInitialTab();
  const handle = { name: 'factura.json', createWritable: () => {} };  // mock handle
  TM.updateCurrent({ fileHandle: handle });
  const active = TM.getActive();
  assert.strictEqual(active.fileHandle, handle, 'fileHandle must be stored on active tab');
});

// ─── TAB-016: Abrir — siempre tab nuevo (pendiente confirmación CR) ──────────
// ⚠ CR PARITY NOTE: CR MDI abre cada File→Open en ventana/tab independiente.
// Si se confirma que CR reemplaza tab vacío, este test debe cambiar el assert.
test('TAB-016: openInNewTab() creates a new tab even when active tab is empty', () => {
  const emptyState = makeDSState({ elements: [] });
  const ctx = buildCtx(emptyState);
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const beforeCount = TM.getTabs().length;  // 1

  const layout = {
    sections: [{ id: 's-rh', stype: 'rh', label: 'Header', height: 60, visible: true }],
    elements: [{ id: 'e100', type: 'text', content: 'loaded-content' }],
    name: 'Factura Cargada', version: '1.0',
  };
  TM.openInNewTab(layout, null);  // null fileHandle (Firefox path or no handle)

  assert.equal(TM.getTabs().length, beforeCount + 1, 'Abrir must create a new tab always');
  assert.ok(
    ctx.DS.elements.some(e => e.content === 'loaded-content'),
    'loaded layout elements must be applied to DS',
  );
});

// ─── TAB-017: Abrir — tab original conservado ────────────────────────────────
test('TAB-017: openInNewTab() preserves active tab content in snapshot', () => {
  const state = makeDSState({
    elements: [{ id: 'e1', type: 'text', content: 'pre-open-content' }],
  });
  const ctx = buildCtx(state);
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const originalTabId = TM.getActive().id;

  const layout = {
    sections: [{ id: 's-rh', stype: 'rh', label: 'Header', height: 60, visible: true }],
    elements: [{ id: 'e100', type: 'text', content: 'newly-opened' }],
    name: 'Factura Nueva', version: '1.0',
  };
  TM.openInNewTab(layout, null);

  // Switch back to original tab
  TM.activate(originalTabId);
  assert.ok(
    ctx.DS.elements.some(e => e.content === 'pre-open-content'),
    'original tab must retain its elements after Abrir',
  );
});

// ─── TAB-018: Guardar usa handle del tab activo ───────────────────────────────
test('TAB-018: updateCurrent({ fileHandle }) on tab1 does not affect tab2 handle', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id  = TM.getActive().id;
  const handle1 = { name: 'factura1.json', createWritable: () => {} };
  TM.updateCurrent({ fileHandle: handle1 });  // save tab1 handle

  TM.create();  // new tab2 active, no handle
  const tab2Active = TM.getActive();
  assert.equal(tab2Active.fileHandle ?? null, null, 'tab2 must have no fileHandle');

  // Now back to tab1 — handle must still be there
  TM.activate(tab1Id);
  const tab1 = TM.getActive();
  assert.strictEqual(tab1.fileHandle, handle1, 'tab1 fileHandle must survive tab switch');
});

// ─── TAB-019: Firefox download no afecta otros tabs ──────────────────────────
test('TAB-019: markCurrentSaved() on tab2 does not dirty-clear tab1', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;

  // Tab1: make it dirty
  ctx.DS.state.historyIndex = 3;
  // Do NOT markCurrentSaved on tab1

  TM.create();  // tab2 active
  ctx.DS.state.historyIndex = 1;
  TM.markCurrentSaved();  // tab2 is saved (e.g. Firefox download)

  // Switch back to tab1 — must still be dirty
  TM.activate(tab1Id);
  assert.equal(TM.isCurrentDirty(), true,
    'tab1 must remain dirty after tab2 was saved');
});

// ─── TAB-020: snapshot restores sections ─────────────────────────────────────
test('TAB-020: activate() restores sections from snapshot (not just elements)', () => {
  const state = makeDSState({
    sections: [
      { id: 's-rh', stype: 'rh', label: 'Encabezado', height: 120, visible: true },
      { id: 's-det', stype: 'det', label: 'Detalle', height: 20, visible: true },
    ],
    elements: [],
  });
  const ctx = buildCtx(state);
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;

  TM.create();  // new tab with default sections
  TM.activate(tab1Id);

  assert.ok(
    ctx.DS.sections.some(s => s.height === 120 && s.stype === 'rh'),
    'tab1 section heights must be restored after tab switch',
  );
});

// ─── TAB-021: closeTab() — último tab nunca se cierra ────────────────────────
test('TAB-021: closeTab() does nothing when only one tab exists (last tab protection)', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const onlyId = TM.getActive().id;
  TM.closeTab(onlyId);
  assert.equal(TM.getTabs().length, 1, 'last tab must not be closed');
  assert.equal(TM.getActive().id, onlyId, 'active tab must remain unchanged');
});

// ─── TAB-022: closeTab() — tab limpio se elimina y activa vecino ─────────────
test('TAB-022: closeTab() on a clean tab removes it and activates neighbor', () => {
  const ctx = buildCtx();
  const TM  = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;
  TM.markCurrentSaved();   // tab1 clean

  TM.create();             // tab2 active
  const tab2Id = TM.getActive().id;
  TM.markCurrentSaved();   // tab2 clean

  TM.closeTab(tab2Id);
  assert.equal(TM.getTabs().length, 1, 'tab count must drop to 1 after close');
  assert.equal(TM.getActive().id, tab1Id, 'tab1 must become active after tab2 is closed');
  assert.equal(ctx._tabsRowChildren.length, 1, 'DOM node must be removed from tabs-row');
});

// ─── TAB-023: closeTab() — dirty tab: confirm false aborta cierre ────────────
test('TAB-023: closeTab() aborts when tab is dirty and user cancels confirm()', () => {
  const ctx = buildCtx();

  // Override window.confirm to simulate user clicking "Cancel"
  ctx.window = { confirm: () => false };

  const TM = loadTabManager(ctx);
  TM._registerInitialTab();
  const tab1Id = TM.getActive().id;
  // Tab1 dirty: watermark at 0, advance history to 1
  TM.markCurrentSaved();
  ctx.DS.state.historyIndex = 1;

  TM.create();             // tab2 active (clean)
  const tab2Id = TM.getActive().id;

  // Try to close tab1 (dirty, inactive)
  TM.closeTab(tab1Id);
  assert.equal(TM.getTabs().length, 2, 'both tabs must remain when confirm() is false');
  assert.equal(TM.getActive().id, tab2Id, 'active tab must not change');
});
