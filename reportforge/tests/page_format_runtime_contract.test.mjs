import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('page-format runtime keeps A4 and Ticket geometry in one layout contract', () => {
  const context = {
    console,
    CFG: { PAGE_W: 754, PAGE_H: 1123 },
    DS: {
      previewMode: false,
      setPageMarginLeft() {},
      setPageMarginTop() {},
    },
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      title: '',
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'engines/RuntimeConfig.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFileApply.js'), 'utf8'), context);

  const apply = context.CommandRuntimeFileApply;
  const base = {
    pageSize: 'A4',
    pageWidth: 794,
    pageHeight: 1123,
    margins: { top: 15, right: 20, bottom: 15, left: 20 },
  };
  const ticket58 = apply._buildPageFormatLayout(base, { format: 'TICKET', ticketWidthMm: 58 });
  assert.equal(ticket58.pageSize, 'TICKET');
  assert.equal(ticket58.pageWidth, 219);
  assert.equal(ticket58.ticketWidthMm, 58);
  assert.deepEqual(JSON.parse(JSON.stringify(ticket58.margins)), { top: 3, right: 3, bottom: 3, left: 3 });

  const ticket70 = apply._buildPageFormatLayout(
    { ...ticket58, margins: { top: 4, right: 5, bottom: 6, left: 7 } },
    { format: 'TICKET', ticketWidthMm: 70 },
  );
  assert.equal(ticket70.pageWidth, 265);
  assert.deepEqual(JSON.parse(JSON.stringify(ticket70.margins)), { top: 4, right: 5, bottom: 6, left: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(apply.getPageFormatState(ticket70))), { format: 'TICKET', ticketWidthMm: 70 });

  const a4 = apply._buildPageFormatLayout(ticket70, { format: 'A4' });
  assert.equal(a4.pageSize, 'A4');
  assert.equal(a4.pageWidth, 794);
  assert.equal(a4.pageHeight, 1123);
  assert.equal(a4.ticketWidthMm, null);
  assert.deepEqual(JSON.parse(JSON.stringify(a4.margins)), { top: 15, right: 20, bottom: 15, left: 20 });
});
