'use strict';
/**
 * FACTORY-MOCKUP-RFDJSON-EXPORT-01 — the mockup must be REAL, loadable JSON
 * (reportforge/layouts/factory_invoice_mockup.rfd.json), not the JS source
 * it was extracted from. 1 test = 1 responsibility (UDS 4.1 canonical rule).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE_PATH = path.join(ROOT, 'reportforge/layouts/factory_invoice_mockup.rfd.json');

function readRaw() {
  return fs.readFileSync(FILE_PATH, 'utf8');
}

test('factory_invoice_mockup.rfd.json exists', () => {
  assert.ok(fs.existsSync(FILE_PATH));
});

test('factory_invoice_mockup.rfd.json parses as valid JSON', () => {
  assert.doesNotThrow(() => JSON.parse(readRaw()));
});

test('factory_invoice_mockup.rfd.json does not start with a JS directive', () => {
  assert.doesNotMatch(readRaw().trimStart(), /^['"]use strict['"]/);
});

test('factory_invoice_mockup.rfd.json contains no JS comments', () => {
  assert.doesNotMatch(readRaw(), /\/\/|\/\*/);
});

test('factory_invoice_mockup.rfd.json has 5 sections', () => {
  const layout = JSON.parse(readRaw());
  assert.equal(layout.sections.length, 5);
});

test('factory_invoice_mockup.rfd.json has 46 elements', () => {
  const layout = JSON.parse(readRaw());
  assert.equal(layout.elements.length, 46);
});

test('factory_invoice_mockup.rfd.json declares pageWidth/pageHeight/pageSize/margins', () => {
  const layout = JSON.parse(readRaw());
  assert.equal(typeof layout.pageWidth, 'number');
  assert.equal(typeof layout.pageHeight, 'number');
  assert.equal(typeof layout.pageSize, 'string');
  assert.equal(typeof layout.margins, 'object');
});
