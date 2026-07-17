import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('page-format model keeps A4 and Ticket geometry in one layout contract', async () => {
  const model = await import(pathToFileURL(path.join(ROOT, 'engines/PageFormatModel.js')).href);
  const base = {
    pageSize: 'A4',
    pageWidth: 794,
    pageHeight: 1123,
    margins: { top: 15, right: 20, bottom: 15, left: 20 },
  };

  const ticket76 = model.buildPageFormatLayout(base, { format: 'TICKET', ticketWidthMm: 76 });
  assert.equal(ticket76.pageSize, 'TICKET');
  assert.equal(ticket76.pageWidth, 287);
  assert.equal(ticket76.ticketWidthMm, 76);
  assert.deepEqual(ticket76.margins, { top: 3, right: 3, bottom: 3, left: 3 });

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

  assert.equal(model.resolvePersistedTicketWidthMm(ticket76), 76);
  assert.equal(model.resolvePersistedTicketWidthMm(ticket58), 58);
  assert.equal(model.resolvePersistedTicketWidthMm(ticket70), 70);
  assert.equal(model.resolvePersistedTicketWidthMm({ ...ticket70, ticketWidthMm: 999 }), 70);
  assert.equal(model.resolvePersistedTicketWidthMm(a4), null);

  const html = fs.readFileSync(path.join(ROOT, 'designer/crystal-reports-designer-v4.html'), 'utf8');
  assert.equal((html.match(/<script type="module" src="\/engines\/PageFormatModel\.js"><\/script>/g) || []).length, 1);
  assert.equal((html.match(/<script src="\/engines\/CommandRuntimeFileLoad\.js"><\/script>/g) || []).length, 1);

  const server = await startRuntimeServer();
  const designerUrl = new URL('/designer/crystal-reports-designer-v4.html', server.baseUrl).toString();
  const { browser, page, consoleErrors } = await launchRuntimePage(designerUrl, { browserName: 'chromium' });
  try {
    const runtime = await page.evaluate(() => ({
      hasModel: !!window.PageFormatModel,
      resolverType: typeof window.PageFormatModel?.resolvePersistedTicketWidthMm,
      loadType: typeof window.CommandRuntimeFileLoad?.refreshLoadedLayout,
      scriptCount: Array.from(document.scripts)
        .filter((script) => script.src.endsWith('/engines/PageFormatModel.js'))
        .length,
      moduleTypes: Array.from(document.scripts)
        .filter((script) => script.src.endsWith('/engines/PageFormatModel.js'))
        .map((script) => script.type),
      graphOrder: Array.from(document.scripts)
        .filter((script) => script.src.endsWith('/engines/CommandRuntimeFileLoad.js')
          || script.src.endsWith('/engines/CommandRuntimeFileSerialization.js')
          || script.src.endsWith('/engines/CommandRuntimeFile.js'))
        .map((script) => script.src.split('/').pop()),
    }));
    assert.equal(runtime.hasModel, true);
    assert.equal(runtime.resolverType, 'function');
    assert.equal(runtime.loadType, 'function');
    assert.equal(runtime.scriptCount, 1);
    assert.deepEqual(runtime.moduleTypes, ['module']);
    assert.deepEqual(runtime.graphOrder, [
      'CommandRuntimeFileLoad.js',
      'CommandRuntimeFileSerialization.js',
      'CommandRuntimeFile.js',
    ]);
    assert.equal(consoleErrors.length, 0);

    const contract = await page.evaluate(() => {
      window.CFG.PAGE_W = 287;
      window.CommandRuntimeFile._currentLayout = {
        ...window.CommandRuntimeFile._currentLayout,
        pageSize: 'TICKET',
        pageWidth: 287,
        pageHeight: 1123,
        ticketWidthMm: null,
        margins: { top: 3, right: 3, bottom: 3, left: 3 },
      };
      window.DS.setPageMarginLeft(3, 'page-format-runtime-contract');
      window.DS.setPageMarginTop(3, 'page-format-runtime-contract');
      const resolver = window.PageFormatModel.resolvePersistedTicketWidthMm(window.CommandRuntimeFile._currentLayout);
      const payload = JSON.parse(window.CommandRuntimeFile.toJSON());
      return {
        resolver,
        ticketWidthMm: payload.ticketWidthMm,
        pageWidth: payload.pageWidth,
        margins: payload.margins,
      };
    });
    assert.equal(contract.resolver, 76);
    assert.equal(contract.ticketWidthMm, 76);
    assert.equal(contract.pageWidth, 287);
    assert.deepEqual(contract.margins, { top: 3, right: 3, bottom: 3, left: 3 });
  } finally {
    await browser.close();
    await server.stop();
  }
});
