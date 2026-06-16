'use strict';
/**
 * PV-HIT — Preview hit-layer interaction geometry contracts.
 * 1 file = 1 responsibility: verify every section type and page produces a
 * clickable .pv-el whose band-relative top matches the render-layer model.
 * Adversarial: this is the regression guard for "only header clickable".
 *
 * Pure: loads PreviewPaginationEngine + PreviewEngineData in a vm with DS/CFG
 * mocks, renders HTML, parses it without a DOM.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadPreview(DS, CFG) {
  const ctx = {
    window: {}, globalThis: {}, console,
    document: undefined,
  };
  ctx.window.PreviewEngineContracts = { assertLayoutContract() {} };
  vm.runInNewContext(fs.readFileSync(resolve(ROOT, 'engines/PreviewPaginationEngine.js'), 'utf8'), ctx);
  // PreviewEngineData references DS, CFG, SAMPLE_DATA as free globals.
  ctx.DS = DS; ctx.CFG = CFG; ctx.SAMPLE_DATA = {};
  ctx.PreviewEngineContracts = ctx.window.PreviewEngineContracts;
  ctx.PreviewPaginationEngine = ctx.window.PreviewPaginationEngine;
  vm.runInNewContext(fs.readFileSync(resolve(ROOT, 'engines/PreviewEngineData.js'), 'utf8'), ctx);
  return ctx.window.PreviewEngineData;
}

// Layout with all 5 section types + a tall rh so detail spills to page 2.
function makeDS() {
  const sections = [
    { id: 's-rh', stype: 'rh', height: 400 },
    { id: 's-ph', stype: 'ph', height: 30 },
    { id: 's-det', stype: 'det', height: 14, iterates: 'items' },
    { id: 's-pf', stype: 'pf', height: 6 },
    { id: 's-rf', stype: 'rf', height: 200 },
  ];
  const elements = [
    { id: 'rh-1', type: 'text', sectionId: 's-rh', x: 10, y: 12, w: 200, h: 16, content: 'RUC', fontSize: 9, fontFamily: 'Arial', align: 'left', color: '#000' },
    { id: 'ph-1', type: 'text', sectionId: 's-ph', x: 10, y: 4, w: 100, h: 12, content: 'Codigo', fontSize: 8, fontFamily: 'Arial', align: 'left', color: '#000' },
    { id: 'det-1', type: 'field', sectionId: 's-det', x: 10, y: 1, w: 100, h: 12, fieldPath: 'item.codigo', fontSize: 7, fontFamily: 'Arial', align: 'left', color: '#000' },
    { id: 'rf-1', type: 'text', sectionId: 's-rf', x: 10, y: 8, w: 100, h: 12, content: 'Total', fontSize: 8, fontFamily: 'Arial', align: 'left', color: '#000' },
    { id: 'pf-1', type: 'text', sectionId: 's-pf', x: 10, y: 0, w: 100, h: 6, content: 'pie', fontSize: 6, fontFamily: 'Arial', align: 'left', color: '#000' },
  ];
  return {
    sections, elements,
    margins: { top: 15, bottom: 15 },
    getSectionTop(id) { let t = 0; for (const s of sections) { if (s.id === id) return t; t += s.height; } return t; },
    _sampleData: {},
  };
}

function manyItems(n) { return { items: Array.from({ length: n }, (_, i) => ({ codigo: `C${i}` })) }; }

// crude HTML parse: list of {id, top} for pv-el within each pv-page
function parsePages(html) {
  const pages = [];
  const pageRe = /<div class="pv-page" data-page="(\d+)"[^>]*>([\s\S]*?)(?=<div class="pv-page"|<div class="pv-page-break"|$)/g;
  let pm;
  while ((pm = pageRe.exec(html))) {
    const body = pm[2];
    const els = [];
    const elRe = /data-id="([^"]+)"[^>]*style="([^"]*)"/g;
    let em;
    while ((em = elRe.exec(body))) {
      const top = /top:(-?\d+(?:\.\d+)?)px/.exec(em[2]);
      els.push({ id: em[1], top: top ? parseFloat(top[1]) : null });
    }
    pages.push({ page: Number(pm[1]), els });
  }
  return pages;
}

test('PV-HIT: report header (rh) element is clickable on page 1', () => {
  const D = loadPreview(makeDS(), { PAGE_W: 671 });
  const pages = parsePages(D.renderWithData(manyItems(2)));
  assert.ok(pages[0].els.some((e) => e.id === 'rh-1'), 'rh element must exist in hit layer page 1');
});

test('PV-HIT: page header (ph) element is clickable', () => {
  const D = loadPreview(makeDS(), { PAGE_W: 671 });
  const pages = parsePages(D.renderWithData(manyItems(2)));
  assert.ok(pages[0].els.some((e) => e.id === 'ph-1'), 'ph element must be clickable');
});

test('PV-HIT: detail (det) element is clickable', () => {
  const D = loadPreview(makeDS(), { PAGE_W: 671 });
  const pages = parsePages(D.renderWithData(manyItems(2)));
  const all = pages.flatMap((p) => p.els);
  assert.ok(all.some((e) => e.id === 'det-1'), 'detail element must be clickable');
});

test('PV-HIT: summary/footer (rf) element is clickable on last page', () => {
  const D = loadPreview(makeDS(), { PAGE_W: 671 });
  const pages = parsePages(D.renderWithData(manyItems(2)));
  const last = pages[pages.length - 1];
  assert.ok(last.els.some((e) => e.id === 'rf-1'), 'rf element must be clickable on last page');
});

test('PV-HIT: element top is BAND-RELATIVE not absolute (regression: only-header-clickable)', () => {
  const D = loadPreview(makeDS(), { PAGE_W: 671 });
  const pages = parsePages(D.renderWithData(manyItems(2)));
  // ph-1 y=4 inside its band -> top must be 4, NOT getSectionTop('s-ph')(=400)+4
  const ph = pages[0].els.find((e) => e.id === 'ph-1');
  assert.equal(ph.top, 4, 'page-header element top must be band-relative (4), not absolute');
  const rf = pages[pages.length - 1].els.find((e) => e.id === 'rf-1');
  assert.equal(rf.top, 8, 'summary element top must be band-relative (8), not absolute');
});

test('PV-HIT: detail spills to page 2 and stays clickable (multipage)', () => {
  const D = loadPreview(makeDS(), { PAGE_W: 671 });
  const pages = parsePages(D.renderWithData(manyItems(120)));
  assert.ok(pages.length >= 2, `expected >=2 pages got ${pages.length}`);
  const page2 = pages[1];
  assert.ok(page2.els.some((e) => e.id === 'det-1'), 'detail rows on page 2 must be clickable');
  // page 2 must NOT re-render rh (only page 1), but MUST re-render ph
  assert.ok(!page2.els.some((e) => e.id === 'rh-1'), 'rh must appear only on page 1');
  assert.ok(page2.els.some((e) => e.id === 'ph-1'), 'ph must repeat on page 2');
});

test('PV-HIT: data-id present on every hit element (drag/resize/copy/paste targets resolvable)', () => {
  const D = loadPreview(makeDS(), { PAGE_W: 671 });
  const html = D.renderWithData(manyItems(120));
  const ids = [...html.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'hit elements must carry data-id');
  // every pv-el also carries origin-id for command runtime resolution
  const origins = [...html.matchAll(/data-origin-id="([^"]+)"/g)].length;
  assert.equal(origins, ids.length, 'every hit element must expose data-origin-id for commands');
});

test('PV-HIT: page-2 instances resolve to editable model elements (copy/paste/delete)', () => {
  const DS = makeDS();
  const D = loadPreview(DS, { PAGE_W: 671 });
  const html = D.renderWithData(manyItems(120));
  const pages = parsePages(html);
  const page2 = pages[1];
  const modelIds = new Set(DS.elements.map((e) => e.id));
  // every clickable instance on page 2 must map to a model element (origin-id),
  // otherwise drag/resize/copy/paste/delete cannot mutate the document.
  const originRe = /data-origin-id="([^"]+)"/g;
  const page2Body = html.split('data-page="2"')[1].split('data-page="3"')[0];
  const origins = [...page2Body.matchAll(originRe)].map((m) => m[1]);
  assert.ok(origins.length > 0, 'page 2 must have resolvable instances');
  for (const oid of origins) {
    assert.ok(modelIds.has(oid), `page-2 instance origin-id ${oid} must exist in DS.elements`);
  }
});

test('PV-HIT: drag/resize on page-2 edits shared model element (single source)', () => {
  const DS = makeDS();
  const D = loadPreview(DS, { PAGE_W: 671 });
  // det-1 renders once per item across pages; all instances share origin det-1.
  const html = D.renderWithData(manyItems(120));
  const detInstances = [...html.matchAll(/data-origin-id="det-1"/g)].length;
  assert.ok(detInstances >= 2, 'detail element instances span multiple pages');
  // mutating the model element (as drag/resize would) is reflected everywhere:
  const model = DS.elements.find((e) => e.id === 'det-1');
  model.x = 99;
  const html2 = D.renderWithData(manyItems(120));
  const movedAll = [...html2.matchAll(/data-origin-id="det-1"[^>]*style="[^"]*left:99px/g)].length;
  assert.equal(movedAll, detInstances, 'every instance must reflect the single model edit');
});
