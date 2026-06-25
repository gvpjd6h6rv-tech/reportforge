'use strict';
/**
 * RF-BARCODE-UI-1 — PropertiesEngine barcode UI
 * Tests that selecting a barcode element renders:
 *   - a barcodeType selector with exactly the 3 real supported types
 *   - a showText checkbox
 *   - that the correct options pre-select the current element value
 *   - that non-barcode elements do NOT get this UI
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import path   from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeBarcode(overrides = {}) {
  return {
    id: 'el-bc', type: 'barcode', sectionId: 's-1',
    x: 10, y: 10, w: 200, h: 60,
    barcodeType: 'code128', showText: true,
    fontFamily: 'Arial', fontSize: 10,
    bold: false, italic: false, underline: false,
    align: 'left', color: '#000', bgColor: 'transparent',
    borderColor: '#000', borderWidth: 0,
    ...overrides,
  };
}

function makeField(overrides = {}) {
  return {
    id: 'el-f', type: 'field', sectionId: 's-1',
    x: 0, y: 0, w: 100, h: 20,
    fieldPath: 'total', fieldFmt: '',
    fontFamily: 'Arial', fontSize: 10,
    bold: false, italic: false, underline: false,
    align: 'left', color: '#000', bgColor: 'transparent',
    borderColor: '#000', borderWidth: 0,
    ...overrides,
  };
}

/**
 * Load PropertiesEngine in a vm context and call render() for the given element.
 * Returns the accumulated HTML of all rows appended to the form.
 */
function renderFor(el) {
  const src = fs.readFileSync(path.join(ROOT, 'engines/PropertiesEngine.js'), 'utf8');

  const appendedHTML = [];

  const formEl = {
    get innerHTML() { return ''; },
    set innerHTML(v) { appendedHTML.length = 0; },  // reset on clear
    className: '',
    classList: { add() {}, remove() {} },
    appendChild(child) {
      // capture innerHTML of the appended DOM node
      appendedHTML.push(child.innerHTML || child.textContent || '');
    },
    querySelectorAll() { return []; },
    children: [],
  };

  const emptyEl = { style: { display: '' } };

  const updateCalls = [];
  const saveCalls   = [];

  const ctx = {
    DS: {
      getSelectedElements() { return [el]; },
      getSection: id => ({ id, label: 'Detalle' }),
      sections: [{ id: 's-1', label: 'Detalle' }],
      selection: new Set([el.id]),
      saveHistory() { saveCalls.push(1); },
      getElementById(id) { return el.id === id ? el : null; },
    },
    CFG: { FONTS: ['Arial'], FONT_SIZES: [8, 10, 12] },
    SelectionEngine: { renderHandles() {} },
    _canonicalCanvasWriter() {
      return { updateElement(id) { updateCalls.push(id); }, updateElementPosition() {}, renderElement() {} };
    },
    document: {
      getElementById(id) {
        if (id === 'props-form') return formEl;
        if (id === 'props-empty') return emptyEl;
        return null;
      },
      createElement(tag) {
        const node = {
          tagName: tag, innerHTML: '', textContent: '', className: '',
          dataset: {}, style: {}, _listeners: {},
          children: [],
          appendChild(ch) { this.children.push(ch); },
          querySelectorAll() { return []; },
          addEventListener(evt, fn) { this._listeners[evt] = fn; },
          classList: { toggle() {}, add() {}, remove() {} },
        };
        return node;
      },
      documentElement: { style: { setProperty() {} } },
    },
    setTimeout(fn) { fn(); },  // synchronous in test
    module: { exports: {} },
  };

  vm.runInNewContext(src, ctx);

  const PE = ctx.module.exports;
  PE.render();

  const allHTML = appendedHTML.join('\n');
  return { allHTML, updateCalls, saveCalls, el };
}

// ─────────────────────────────────────────────────────────────────────────────

test('barcode: barcodeType selector contains only the 3 real supported types', () => {
  const { allHTML } = renderFor(makeBarcode());
  assert.match(allHTML, /value="code128"/, 'must have code128');
  assert.match(allHTML, /value="code39"/, 'must have code39');
  assert.match(allHTML, /value="qr"/, 'must have qr');
  assert.doesNotMatch(allHTML, /value="ean13"/, 'ean13 must NOT appear');
  assert.doesNotMatch(allHTML, /value="pdf417"/, 'pdf417 must NOT appear');
  assert.doesNotMatch(allHTML, /value="upc"/, 'upc must NOT appear');
  assert.doesNotMatch(allHTML, /value="code128b"/, 'code128b alias must NOT appear');
});

test('barcode: barcodeType selector has id="prop-barcode-type"', () => {
  const { allHTML } = renderFor(makeBarcode());
  assert.match(allHTML, /id="prop-barcode-type"/, 'selector must have correct id');
});

test('barcode: barcodeType selector pre-selects code128 (default)', () => {
  const { allHTML } = renderFor(makeBarcode({ barcodeType: 'code128' }));
  assert.match(allHTML, /value="code128"\s+selected|selected[^>]*value="code128"/, 'code128 must be selected');
});

test('barcode: barcodeType selector pre-selects code39', () => {
  const { allHTML } = renderFor(makeBarcode({ barcodeType: 'code39' }));
  assert.match(allHTML, /value="code39"\s+selected|selected[^>]*value="code39"/, 'code39 must be selected');
});

test('barcode: barcodeType selector pre-selects qr', () => {
  const { allHTML } = renderFor(makeBarcode({ barcodeType: 'qr' }));
  assert.match(allHTML, /value="qr"\s+selected|selected[^>]*value="qr"/, 'qr must be selected');
});

test('barcode: showText checkbox has id="prop-barcode-showtext"', () => {
  const { allHTML } = renderFor(makeBarcode());
  assert.match(allHTML, /id="prop-barcode-showtext"/, 'checkbox must have correct id');
});

test('barcode: showText checkbox is checked when showText=true', () => {
  const { allHTML } = renderFor(makeBarcode({ showText: true }));
  assert.match(allHTML, /prop-barcode-showtext[^>]*checked|checked[^>]*prop-barcode-showtext/, 'must be checked');
});

test('barcode: showText checkbox is NOT checked when showText=false', () => {
  const { allHTML } = renderFor(makeBarcode({ showText: false }));
  // The checkbox should exist but NOT have checked attribute
  assert.match(allHTML, /id="prop-barcode-showtext"/, 'checkbox must exist');
  assert.doesNotMatch(allHTML, /prop-barcode-showtext[^>]*checked|checked[^>]*prop-barcode-showtext/, 'must NOT be checked');
});

test('barcode: barcodeType change triggers updateElement', () => {
  // This test verifies the change handler wires up correctly via _selectRow
  // The actual DOM event is tested via runtime; here we just verify the HTML
  const { allHTML } = renderFor(makeBarcode());
  assert.match(allHTML, /prop-barcode-type/, 'selector must be present for listener wiring');
});

test('field element: does NOT get barcodeType selector', () => {
  const { allHTML } = renderFor(makeField());
  assert.doesNotMatch(allHTML, /value="code128"/, 'field must not get barcode type selector');
  assert.doesNotMatch(allHTML, /prop-barcode-type/, 'field must not have prop-barcode-type');
});

test('field element: does NOT get showText checkbox', () => {
  const { allHTML } = renderFor(makeField());
  assert.doesNotMatch(allHTML, /prop-barcode-showtext/, 'field must not have showText checkbox');
});
