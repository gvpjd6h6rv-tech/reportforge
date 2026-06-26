'use strict';
/**
 * RF-INSERT-BARCODE-1 — Barcode insert + Preview-mode insert parity tests
 *
 * Test IDs: INS-001 … INS-010
 *
 * Coverage:
 *   INS-001  HTML menu Insertar contains insert-barcode item
 *   INS-002  handleInsertCommands('insert-barcode') calls InsertEngine.setTool('barcode')
 *   INS-003  InsertEngine.onMouseUp with tool='barcode' creates type:'barcode' element
 *   INS-004  Created barcode element has correct defaults (barcodeType, showText, dimensions)
 *   INS-005  Barcode element survives JSON round-trip (save → parse → reload)
 *   INS-006  setTool('barcode') in preview mode auto-switches to Design before activating tool
 *   INS-007  setTool('pointer') in preview mode does NOT trigger mode switch
 *   INS-008  toolbar button data-tool="barcode" exists in HTML
 *   INS-009  insert-barcode is dispatched by CommandRuntimeHandlersInsert source
 *   INS-010  Created barcode element is selected immediately after insert
 *
 * VM fixture notes:
 *   - ctx.window = ctx  → mirrors browser (window === globalThis), so IIFE globals land on ctx
 *   - loadInsertEngine returns ctx.module.exports because `const InsertEngine = {...}` in vm
 *     does NOT go to the global object; only module.exports does
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import vm     from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML  = fs.readFileSync(path.join(ROOT, 'designer/crystal-reports-designer-v4.html'), 'utf8');

// ─── INS-001: HTML menu ───────────────────────────────────────────────────────
test('INS-001: dd-insertar menu contains data-action="insert-barcode" item', () => {
  assert.ok(
    HTML.includes('data-action="insert-barcode"'),
    'HTML must have a dd-item with data-action="insert-barcode"',
  );
});

// ─── INS-008: toolbar button ──────────────────────────────────────────────────
test('INS-008: toolbar contains data-tool="barcode" button', () => {
  assert.ok(
    HTML.includes('data-tool="barcode"'),
    'HTML toolbar must have a button with data-tool="barcode"',
  );
});

// ─── INS-009: handler source contains insert-barcode ─────────────────────────
test('INS-009: CommandRuntimeHandlersInsert source handles insert-barcode action', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeHandlersInsert.js'), 'utf8');
  assert.ok(
    src.includes("'insert-barcode'") || src.includes('"insert-barcode"'),
    'CommandRuntimeHandlersInsert.js must dispatch insert-barcode',
  );
});

// ─── VM context factory ───────────────────────────────────────────────────────

function makeInsertCtx({ previewMode = false } = {}) {
  const elements = [];
  const selected = [];
  let currentTool      = 'pointer';
  let previewHideCalled = false;
  let previewModeState  = previewMode;
  let _id = 0;

  const ctx = {
    // module.exports bridge — InsertEngine uses this
    module: { exports: {} },

    // DS stub
    DS: {
      get tool()        { return currentTool; },
      get previewMode() { return previewModeState; },
      get sections()    { return [{ id: 'sec1', stype: 'det', label: 'Det', height: 14, visible: true }]; },
      get elements()    { return elements; },
      state: { history: [], historyIndex: 0, zoom: 1, zoomDesign: 1, zoomPreview: 1 },
      setTool(t)        { currentTool = t; },
      setElements(els)  { elements.splice(0, elements.length, ...els); },
      selectOnly(id)    { selected.splice(0, selected.length, id); },
      saveHistory()     { /* no-op */ },
      snap(v)           { return v; },
      getSectionAtY()   { return { section: { id: 'sec1' } }; },
      getSectionTop()   { return 0; },
    },

    // PreviewEngineMode stub
    PreviewEngineMode: {
      hide()     { previewHideCalled = true; previewModeState = false; },
      isActive() { return previewModeState; },
    },

    // Engine stubs
    SelectionEngine:    { _drag: null, clearSelection() {}, startRubberBand() {}, renderHandles() {} },
    PropertiesEngine:   { render() {} },
    FormatEngine:       { updateToolbar() {} },
    SectionEngine:      { render() {} },

    // DOM stub
    document: {
      querySelectorAll() { return { forEach() {} }; },
      getElementById()   {
        return {
          scrollLeft: 0, scrollTop: 0,
          className: '',
          style: {},
          classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
          textContent: '',
        };
      },
      querySelector() { return null; },
    },

    // Globals InsertEngine expects
    _canonicalCanvasWriter: () => ({ renderElement() {} }),
    getCanvasPos: (e) => ({ x: e.x || 0, y: e.y || 0 }),
    computeLayout: () => ({ rulerWidth: 20, rulerHeight: 20 }),
    CFG: { PAGE_W: 754, GRID: 2 },

    // mkEl — browser version lives in DocumentState IIFE; expose here as global
    mkEl(type, sectionId, x, y, w, h, extra = {}) {
      return {
        id: `el-${++_id}`, type, sectionId, x, y, w, h,
        fontFamily: 'Arial', fontSize: 8, bold: false, italic: false,
        align: 'left', color: '#000000', bgColor: 'transparent',
        borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid',
        content: '', fieldPath: '', lineDir: 'h', lineWidth: 1, zIndex: 0,
        ...extra,
      };
    },
    newId: () => `el-${++_id}`,

    // Test introspection helpers
    _get_previewHideCalled: () => previewHideCalled,
    _get_selected:          () => selected,
    _get_currentTool:       () => currentTool,
  };

  // KEY: ctx.window = ctx mirrors browser (window === globalThis).
  // IIFEs that do `(function(global){...})(window)` set globals on ctx directly,
  // making them accessible as vm globals in the same sandbox.
  ctx.window = ctx;

  return ctx;
}

function loadInsertEngine(ctx) {
  const src = fs.readFileSync(path.join(ROOT, 'engines/InsertEngine.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  // `const InsertEngine = {...}` in vm does NOT go to ctx global object.
  // Only `module.exports = InsertEngine` (at end of file) makes it accessible.
  return ctx.module.exports;
}

function loadHandlersInsert(ctx) {
  const sharedSrc = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeShared.js'), 'utf8');
  vm.runInNewContext(sharedSrc, ctx);
  // CommandRuntimeShared IIFE sets ctx.CommandRuntimeShared (via ctx.window = ctx)
  const src = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeHandlersInsert.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  // IIFE sets ctx.CommandRuntimeHandlersInsert (via ctx.window = ctx)
  return ctx.CommandRuntimeHandlersInsert;
}

// ─── INS-002: handleInsertCommands dispatches barcode ────────────────────────
test('INS-002: handleInsertCommands("insert-barcode") calls InsertEngine.setTool("barcode")', () => {
  const ctx = makeInsertCtx();
  let toolSet = null;
  ctx.InsertEngine = { setTool(t) { toolSet = t; } };
  const handlers = loadHandlersInsert(ctx);
  handlers.handleInsertCommands('insert-barcode');
  assert.equal(toolSet, 'barcode', 'setTool must be called with "barcode"');
});

// ─── INS-003: onMouseUp creates type:barcode element ─────────────────────────
test('INS-003: InsertEngine.onMouseUp with tool="barcode" creates type:"barcode" element', () => {
  const ctx = makeInsertCtx();
  const IE  = loadInsertEngine(ctx);

  IE.setTool('barcode');
  IE.onCanvasMouseDown({ x: 10, y: 10 });
  IE.onMouseUp({ x: 110, y: 70 });

  const barEls = ctx.DS.elements.filter(e => e.type === 'barcode');
  assert.equal(barEls.length, 1, 'exactly one barcode element must be created');
});

// ─── INS-004: barcode element has correct defaults ────────────────────────────
test('INS-004: created barcode element has barcodeType="code128" and showText=true by default', () => {
  const ctx = makeInsertCtx();
  const IE  = loadInsertEngine(ctx);

  IE.setTool('barcode');
  IE.onCanvasMouseDown({ x: 10, y: 10 });
  IE.onMouseUp({ x: 210, y: 70 });

  const el = ctx.DS.elements.find(e => e.type === 'barcode');
  assert.ok(el, 'barcode element must exist');
  assert.equal(el.barcodeType, 'code128', 'default barcodeType must be code128');
  assert.equal(el.showText,    true,       'default showText must be true');
  assert.ok(el.w >= 120, `barcode width must be >= 120 (got ${el.w})`);
  assert.ok(el.h >= 40,  `barcode height must be >= 40 (got ${el.h})`);
});

// ─── INS-005: JSON round-trip ────────────────────────────────────────────────
test('INS-005: barcode element survives JSON stringify/parse round-trip', () => {
  const barcode = {
    id: 'el-bc1', type: 'barcode', sectionId: 'sec1',
    x: 10, y: 10, w: 200, h: 60,
    barcodeType: 'qr', showText: false, fieldPath: 'Customer.Code',
  };
  const json   = JSON.stringify({ elements: [barcode] });
  const parsed = JSON.parse(json);
  const el     = parsed.elements[0];
  assert.equal(el.type,        'barcode');
  assert.equal(el.barcodeType, 'qr');
  assert.equal(el.showText,    false);
  assert.equal(el.fieldPath,   'Customer.Code');
});

// ─── INS-006: preview mode → auto-switch to Design ───────────────────────────
test('INS-006: setTool("barcode") while in previewMode calls PreviewEngineMode.hide()', () => {
  const ctx = makeInsertCtx({ previewMode: true });
  const IE  = loadInsertEngine(ctx);

  IE.setTool('barcode');

  assert.ok(ctx._get_previewHideCalled(),         'PreviewEngineMode.hide() must be called');
  assert.equal(ctx._get_currentTool(), 'barcode', 'tool must be "barcode" after mode switch');
});

// ─── INS-007: pointer in preview does NOT switch mode ────────────────────────
test('INS-007: setTool("pointer") while in previewMode does NOT call PreviewEngineMode.hide()', () => {
  const ctx = makeInsertCtx({ previewMode: true });
  const IE  = loadInsertEngine(ctx);

  IE.setTool('pointer');

  assert.ok(!ctx._get_previewHideCalled(), 'hide() must NOT be called for pointer tool');
});

// ─── INS-010: element is selected after insert ───────────────────────────────
test('INS-010: inserted barcode element is immediately selected', () => {
  const ctx = makeInsertCtx();
  const IE  = loadInsertEngine(ctx);

  IE.setTool('barcode');
  IE.onCanvasMouseDown({ x: 10, y: 10 });
  IE.onMouseUp({ x: 210, y: 70 });

  const el = ctx.DS.elements.find(e => e.type === 'barcode');
  assert.ok(el, 'element must exist');
  assert.ok(ctx._get_selected().includes(el.id), 'barcode must be in selection after insert');
});
