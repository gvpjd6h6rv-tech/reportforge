'use strict';
/**
 * DOCUMENTSTATE-FACTORY-MOCKUP-EXTRACT-01 — equivalence tests.
 *
 * Proves createState()'s initial mockup is unchanged after extracting it
 * from DocumentState.js into FactoryInvoiceMockupLayout.js. 1 test = 1
 * responsibility: each test checks exactly one claim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadDocumentState() {
  const mockupSrc = fs.readFileSync(path.join(ROOT, 'engines/FactoryInvoiceMockupLayout.js'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'engines/DocumentState.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(`${mockupSrc}\n${src}`, ctx);
  return ctx.module.exports;
}

function findEl(elements, content) {
  return elements.find((e) => e.content === content);
}

test('createState() returns exactly 5 sections', () => {
  const { state } = loadDocumentState().createDocumentState();
  assert.equal(state.sections.length, 5);
});

test('createState() returns exactly 46 elements', () => {
  const { state } = loadDocumentState().createDocumentState();
  assert.equal(state.elements.length, 46);
});

test('key text FACTURA is present', () => {
  const { state } = loadDocumentState().createDocumentState();
  assert.ok(findEl(state.elements, 'FACTURA'), 'FACTURA text missing');
});

test('key text VALOR TOTAL: is present', () => {
  const { state } = loadDocumentState().createDocumentState();
  assert.ok(findEl(state.elements, 'VALOR TOTAL:'), 'VALOR TOTAL: text missing');
});

test('key text ReportForge Linux footer is present', () => {
  const { state } = loadDocumentState().createDocumentState();
  assert.ok(
    findEl(state.elements, 'Documento generado electrónicamente - ReportForge Linux'),
    'ReportForge Linux footer missing',
  );
});

// FACTORY-MOCKUP-A4-RECONCILE-01: pageWidth 754->794, x/w scaled by
// 794/754=1.0530503978779842; y/h stay byte-identical (unscaled).
test('fiscal rect y/h are unchanged, x/w scaled by 794/754', () => {
  const { state } = loadDocumentState().createDocumentState();
  const fiscalRect = state.elements.find((e) => e.type === 'rect' && e.sectionId === 's-rh');
  assert.deepEqual([fiscalRect.x, fiscalRect.y, fiscalRect.w, fiscalRect.h], [558.12, 4, 231.67, 96]);
});

test('table header rect y/h are unchanged, x/w scaled by 794/754', () => {
  const { state } = loadDocumentState().createDocumentState();
  const tableHeader = state.elements.find((e) => e.type === 'rect' && e.sectionId === 's-ph');
  assert.deepEqual([tableHeader.x, tableHeader.y, tableHeader.w, tableHeader.h], [4.21, 62, 785.58, 16]);
});

test('subtotal label y is unchanged, x scaled by 794/754', () => {
  const { state } = loadDocumentState().createDocumentState();
  const subtotal = findEl(state.elements, 'SUBTOTAL:');
  assert.deepEqual([subtotal.x, subtotal.y], [463.34, 33]);
});

test('valor total field y/h are unchanged, x/w scaled by 794/754', () => {
  const { state } = loadDocumentState().createDocumentState();
  const valorTotal = findEl(state.elements, 'VALOR TOTAL:');
  assert.deepEqual([valorTotal.x, valorTotal.y, valorTotal.w, valorTotal.h], [463.34, 71, 136.9, 16]);
});

test('ReportForge footer y is unchanged, x scaled by 794/754', () => {
  const { state } = loadDocumentState().createDocumentState();
  const footer = findEl(state.elements, 'Documento generado electrónicamente - ReportForge Linux');
  assert.deepEqual([footer.x, footer.y], [4.21, 8]);
});

test('all 6 key fieldPaths are present', () => {
  const { state } = loadDocumentState().createDocumentState();
  const paths = state.elements.map((e) => e.fieldPath).filter(Boolean);
  for (const expected of [
    'empresa.razon_social', 'fiscal.numero_documento', 'cliente.razon_social',
    'item.codigo', 'item.descripcion', 'totales.importe_total',
  ]) {
    assert.ok(paths.includes(expected), `fieldPath ${expected} missing`);
  }
});

test('DocumentState.js no longer hardcodes the mockup elements array inline', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/DocumentState.js'), 'utf8');
  assert.doesNotMatch(src, /mkEl\('field', 's-rh', 4, 4, 380, 16/, 'mockup element literal still inline');
});

test('DocumentState.js delegates createState() to FactoryMockup.build(mkEl)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/DocumentState.js'), 'utf8');
  assert.match(src, /FactoryMockup\.build\(mkEl\)/);
});

test('FactoryInvoiceMockupLayout.js owns sections data', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/FactoryInvoiceMockupLayout.js'), 'utf8');
  assert.match(src, /sections:/);
});

test('FactoryInvoiceMockupLayout.js owns elements data', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/FactoryInvoiceMockupLayout.js'), 'utf8');
  assert.match(src, /elements:/);
});

test('FactoryInvoiceMockupLayout.js does not own behavior/runtime state fields', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/FactoryInvoiceMockupLayout.js'), 'utf8');
  for (const forbidden of ['selection:', 'zoom:', 'history:', 'clipboard:', 'previewMode:']) {
    assert.doesNotMatch(src, new RegExp(forbidden), `mockup file should not own state field ${forbidden}`);
  }
});
