import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('page-format model keeps A4 and Ticket geometry in one layout contract', async () => {
  const model = await import(pathToFileURL(path.join(ROOT, 'engines/PageFormatModel.js')).href);
  const base = {
    pageSize: 'A4',
    pageWidth: 794,
    pageHeight: 1123,
    margins: { top: 15, right: 20, bottom: 15, left: 20 },
  };

  const ticket58 = model.buildPageFormatLayout(base, { format: 'TICKET', ticketWidthMm: 58 });
  assert.equal(ticket58.pageSize, 'TICKET');
  assert.equal(ticket58.pageWidth, 219);
  assert.equal(ticket58.ticketWidthMm, 58);
  assert.deepEqual(ticket58.margins, { top: 3, right: 3, bottom: 3, left: 3 });

  const ticket70 = model.buildPageFormatLayout(
    { ...ticket58, margins: { top: 4, right: 5, bottom: 6, left: 7 } },
    { format: 'TICKET', ticketWidthMm: 70 },
  );
  assert.equal(ticket70.pageWidth, 265);
  assert.deepEqual(ticket70.margins, { top: 4, right: 5, bottom: 6, left: 7 });
  assert.deepEqual(model.getPageFormatState(ticket70), { format: 'TICKET', ticketWidthMm: 70 });

  const a4 = model.buildPageFormatLayout(ticket70, { format: 'A4' });
  assert.equal(a4.pageSize, 'A4');
  assert.equal(a4.pageWidth, 794);
  assert.equal(a4.pageHeight, 1123);
  assert.equal(a4.ticketWidthMm, null);
  assert.deepEqual(a4.margins, { top: 15, right: 20, bottom: 15, left: 20 });
});
