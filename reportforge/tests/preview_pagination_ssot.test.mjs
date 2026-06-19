'use strict';
/**
 * PV-PAG — PreviewPaginationEngine contracts (SSOT, pure).
 * 1 file = 1 responsibility: pagination math only.
 * Adversarial: asserts hit-layer pagination equals the Python render engine's
 * formula (replicated here as oracle) for 1, 2 and N pages.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ADV_FIXTURE = JSON.parse(fs.readFileSync(resolve(ROOT, 'examples/pagination_adversarial.json'), 'utf8'));

function loadPaginator() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/PreviewPaginationEngine.js'), 'utf8');
  const ctx = { window: {}, globalThis: {} };
  vm.runInNewContext(src, ctx);
  return ctx.window.PreviewPaginationEngine;
}

/* Oracle: faithful re-implementation of advanced_engine.py::_pages.
 * Returns the rowEnd boundaries (exclusive) per page. */
function enginePagesOracle(sections, rowHeights, { pageH, mTop, mBot }) {
  const sum = (st) => sections.filter(s => s.stype === st).reduce((a, s) => a + Math.round(s.height), 0);
  const phH = sum('ph'), pfH = sum('pf'), rhH = sum('rh');
  const usable = pageH - mTop - mBot - phH - pfH;
  const pages = [];
  let curStart = 0, cy = 0, count = 0;
  for (let i = 0; i < rowHeights.length; i++) {
    const rowH = Math.round(rowHeights[i].height);
    const forceBreak = !!rowHeights[i].forceBreak;
    const avail = usable - (pages.length === 0 ? rhH : 0);
    if ((forceBreak && count > 0) || (cy + rowH > avail && count > 0)) {
      pages.push({ rowStart: curStart, rowEnd: i }); curStart = i; cy = 0; count = 0;
    }
    cy += rowH; count++;
  }
  pages.push({ rowStart: curStart, rowEnd: rowHeights.length });
  return pages;
}

const SECS = [
  { id: 's-rh', stype: 'rh', height: 295 },
  { id: 's-ph', stype: 'ph', height: 16 },
  { id: 's-det', stype: 'det', height: 14, iterates: 'items' },
  { id: 's-rf', stype: 'rf', height: 90 },
];
const METRICS = { pageH: 1123, mTop: 45, mBot: 45 };

function rows(n, h = 14) { return Array.from({ length: n }, () => ({ height: h, forceBreak: false })); }

function resolvePath(path, row) {
  if (!path) return '';
  const k = path.replace(/^items?\./, '');
  return row[k];
}

function calcElH(el, value) {
  if (value === null || value === undefined || value === '') return el.h;
  const PT = 1.333;
  const CH = 0.6;
  const cw = Math.max(1, Math.trunc(el.w / Math.max(0.01, el.fontSize * PT * CH)));
  const lh = Math.trunc(el.fontSize * PT * 1.4);
  const t = String(value).replace(/<[^>]+>/g, '');
  return Math.max(el.h, Math.max(1, Math.ceil(t.length / cw)) * lh + 4);
}

function mm2px(mm) {
  return Math.trunc(Number(mm || 0) * 3.7795);
}

function splitContract(layout, rowHeight, rowCount) {
  const sections = layout.sections;
  const sum = (st) => sections.filter((s) => s.stype === st).reduce((a, s) => a + Math.round(Number(s.height) || 0), 0);
  const phH = sum('ph');
  const pfH = sum('pf');
  const rhH = sum('rh');
  const usable = layout.pageHeight - mm2px(layout.margins?.top) - mm2px(layout.margins?.bottom) - phH - pfH;
  const firstPageRows = Math.floor((usable - rhH) / rowHeight);
  return [firstPageRows, rowCount - firstPageRows];
}

test('PV-PAG: single page when rows fit (contract: totalPages === 1)', () => {
  const P = loadPaginator();
  const plan = P.paginate(SECS, rows(2), METRICS);
  assert.equal(plan.totalPages, 1);
  assert.equal(plan.pages[0].first, true);
  assert.equal(plan.pages[0].last, true);
  assert.equal(plan.pages[0].rowEnd, 2);
});

test('PV-PAG: two pages when rows overflow page 1 (contract: totalPages === 2)', () => {
  const P = loadPaginator();
  // usable = 1123-45-45-16-0 = 1017; page1 avail = 1017-295 = 722 -> 51 rows @14
  const plan = P.paginate(SECS, rows(60), METRICS);
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].first, true);
  assert.equal(plan.pages[1].last, true);
  assert.ok(plan.pages[0].rowEnd > 0 && plan.pages[0].rowEnd < 60);
});

test('PV-PAG: N pages for large item count (contract: monotonic, covers all rows)', () => {
  const P = loadPaginator();
  const plan = P.paginate(SECS, rows(300), METRICS);
  assert.ok(plan.totalPages >= 3, `expected >=3 pages got ${plan.totalPages}`);
  // every row covered exactly once, contiguous
  assert.equal(plan.pages[0].rowStart, 0);
  for (let i = 1; i < plan.pages.length; i++) {
    assert.equal(plan.pages[i].rowStart, plan.pages[i - 1].rowEnd, 'pages must be contiguous');
  }
  assert.equal(plan.pages[plan.pages.length - 1].rowEnd, 300, 'last page must reach final row');
});

test('PV-PAG: high report-header still fits exact first-page capacity', () => {
  const P = loadPaginator();
  const secs = [
    { id: 's-rh', stype: 'rh', height: 409 },
    { id: 's-ph', stype: 'ph', height: 16 },
    { id: 's-det', stype: 'det', height: 32, iterates: 'items' },
    { id: 's-rf', stype: 'rf', height: 90 },
  ];
  const metrics = { pageH: 1053, mTop: 0, mBot: 0 };
  const plan = P.paginate(secs, rows(22, 32), metrics);
  const [expectedFirst, expectedSecond] = splitContract(
    { sections: secs, pageHeight: metrics.pageH, margins: { top: 0, bottom: 0 } },
    32,
    22,
  );
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].rowEnd - plan.pages[0].rowStart, expectedFirst);
  assert.equal(plan.pages[1].rowEnd - plan.pages[1].rowStart, expectedSecond);
  assert.equal(plan.pages[0].rowEnd, expectedFirst, 'first page must consume the contract-derived rows');
  assert.equal(plan.pages[1].rowEnd, 22, 'second page must consume the remaining rows');
});

test('PV-PAG: shared adversarial fixture keeps JS contract exact-fit and last-page footer', () => {
  const P = loadPaginator();
  const layout = ADV_FIXTURE.layout;
  const data = ADV_FIXTURE.data;
  const detail = layout.sections.filter((s) => s.stype === 'det');
  assert.equal(detail.length, 1, 'fixture must have one detail section');
  const rowH = Math.round(detail[0].height);
  const metrics = {
    pageH: layout.pageHeight,
    mTop: mm2px(layout.margins?.top),
    mBot: mm2px(layout.margins?.bottom),
  };
  const secs = layout.sections.map((s) => ({
    stype: s.stype,
    height: s.height,
    newPageBefore: !!s.newPageBefore,
  }));
  const rowsIn = rows(data.items.length, rowH);
  const plan = P.paginate(secs, rowsIn, metrics);
  const [expectedFirst, expectedSecond] = splitContract(layout, rowH, data.items.length);
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].rowEnd - plan.pages[0].rowStart, expectedFirst);
  assert.equal(plan.pages[1].rowEnd - plan.pages[1].rowStart, expectedSecond);
  assert.equal(plan.pages[0].rowEnd, expectedFirst);
  assert.equal(plan.pages[1].rowEnd, data.items.length);
});

test('PV-PAG: zero-margin variant preserves the same contract shape', () => {
  const P = loadPaginator();
  const layout = JSON.parse(JSON.stringify(ADV_FIXTURE.layout));
  layout.margins.top = 0;
  layout.margins.bottom = 0;
  layout.pageHeight = 1053;
  const data = ADV_FIXTURE.data;
  const metrics = {
    pageH: layout.pageHeight,
    mTop: 0,
    mBot: 0,
  };
  const secs = layout.sections.map((s) => ({
    stype: s.stype,
    height: s.height,
    newPageBefore: !!s.newPageBefore,
  }));
  const detail = layout.sections.filter((s) => s.stype === 'det');
  const rowH = Math.round(detail[0].height);
  const rowsIn = rows(data.items.length, rowH);
  const plan = P.paginate(secs, rowsIn, metrics);
  const [expectedFirst, expectedSecond] = splitContract(layout, rowH, data.items.length);
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].rowEnd, expectedFirst);
  assert.equal(plan.pages[1].rowEnd, data.items.length);
  assert.equal(plan.pages[0].rowEnd - plan.pages[0].rowStart, expectedFirst);
  assert.equal(plan.pages[1].rowEnd - plan.pages[1].rowStart, expectedSecond);
});

test('PV-PAG: growable rows feed pagination from computed heights', () => {
  const P = loadPaginator();
  const layout = JSON.parse(JSON.stringify(ADV_FIXTURE.layout));
  layout.elements.push({
    id: 'dt-grow',
    type: 'field',
    sectionId: 's-dt',
    x: 4,
    y: 16,
    w: 180,
    h: 14,
    fieldPath: 'item.note',
    fontSize: 8,
    canGrow: true,
  });
  const items = Array.from({ length: 4 }, (_, i) => ({
    code: `G${String(i).padStart(3, '0')}`,
    name: `Grow ${i}`,
    note: 'G'.repeat(180),
  }));
  const detEls = layout.elements.filter((e) => e.sectionId === 's-dt');
  const metrics = {
    pageH: layout.pageHeight,
    mTop: mm2px(layout.margins?.top),
    mBot: mm2px(layout.margins?.bottom),
  };
  const secs = layout.sections.map((s) => ({
    stype: s.stype,
    height: s.height,
    newPageBefore: !!s.newPageBefore,
  }));
  const rowsIn = items.map((it) => ({
    height: (() => {
      let extra = 0;
      for (const el of detEls) {
        if (!el.canGrow) continue;
        const value = resolvePath(el.fieldPath, it);
        extra = Math.max(extra, calcElH(el, value) - el.h);
      }
      return (layout.sections.find((s) => s.stype === 'det').height | 0) + extra;
    })(),
    forceBreak: false,
  }));
  const plan = P.paginate(secs, rowsIn, metrics);
  assert.equal(rowsIn[0].height > 32, true, 'growable row height must exceed base height');
  assert.equal(plan.pages[0].rowStart, 0);
  assert.equal(plan.pages[plan.pages.length - 1].rowEnd, items.length);
  assert.equal(plan.pages.reduce((a, p) => a + (p.rowEnd - p.rowStart), 0), items.length);
});

test('PV-PAG: zero-valued growable field exact split stays on two pages', () => {
  const P = loadPaginator();
  const layout = {
    pageHeight: 27,
    margins: { top: 0, bottom: 0 },
    sections: [
      { id: 's-det', stype: 'det', height: 10, iterates: 'items' },
    ],
    elements: [
      {
        id: 'dt-zero',
        type: 'field',
        sectionId: 's-det',
        x: 4,
        y: 0,
        w: 180,
        h: 10,
        fieldPath: 'item.note',
        fontSize: 8,
        canGrow: true,
      },
    ],
  };
  const items = [{ note: 0 }, { note: 0 }];
  const secs = layout.sections.map((s) => ({
    stype: s.stype,
    height: s.height,
    newPageBefore: !!s.newPageBefore,
  }));
  const detEls = layout.elements.filter((e) => e.sectionId === 's-det');
  const rowsIn = items.map((it) => ({
    height: (() => {
      let extra = 0;
      for (const el of detEls) {
        if (!el.canGrow) continue;
        const v = el.type === 'field' && el.fieldPath ? resolvePath(el.fieldPath, it) : (el.content !== null && el.content !== undefined ? el.content : '');
        extra = Math.max(extra, calcElH(el, v) - el.h);
      }
      return layout.sections[0].height + extra;
    })(),
    forceBreak: false,
  }));
  const plan = P.paginate(secs, rowsIn, { pageH: layout.pageHeight, mTop: 0, mBot: 0 });
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].rowEnd, 1);
  assert.equal(plan.pages[1].rowStart, 1);
  assert.equal(plan.pages[1].rowEnd, 2);
});

test('PV-PAG: zero-valued growable content exact split stays on two pages', () => {
  const P = loadPaginator();
  const layout = {
    pageHeight: 27,
    margins: { top: 0, bottom: 0 },
    sections: [
      { id: 's-det', stype: 'det', height: 10, iterates: 'items' },
    ],
    elements: [
      {
        id: 'dt-zero-content',
        type: 'text',
        sectionId: 's-det',
        x: 4,
        y: 0,
        w: 180,
        h: 10,
        content: 0,
        fontSize: 8,
        fontFamily: 'Arial',
        align: 'left',
        color: '#000',
        canGrow: true,
      },
    ],
  };
  const items = [{}, {}];
  const secs = layout.sections.map((s) => ({
    stype: s.stype,
    height: s.height,
    newPageBefore: !!s.newPageBefore,
  }));
  const detEls = layout.elements.filter((e) => e.sectionId === 's-det');
  const rowsIn = items.map((it) => ({
    height: (() => {
      let extra = 0;
      for (const el of detEls) {
        if (!el.canGrow) continue;
        const v = el.type === 'field' && el.fieldPath ? resolvePath(el.fieldPath, it) : (el.content !== null && el.content !== undefined ? el.content : '');
        extra = Math.max(extra, calcElH(el, v) - el.h);
      }
      return layout.sections[0].height + extra;
    })(),
    forceBreak: false,
  }));
  const plan = P.paginate(secs, rowsIn, { pageH: layout.pageHeight, mTop: 0, mBot: 0 });
  assert.equal(rowsIn[0].height > layout.sections[0].height, true, 'zero content must grow the row');
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].rowEnd, 1);
  assert.equal(plan.pages[1].rowStart, 1);
  assert.equal(plan.pages[1].rowEnd, 2);
});

test('PV-PAG: forceBreak (newPageBefore) splits even when space remains', () => {
  const P = loadPaginator();
  const rh = rows(4);
  rh[2].forceBreak = true;
  const plan = P.paginate(SECS, rh, METRICS);
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].rowEnd, 2);
  assert.equal(plan.pages[1].rowStart, 2);
});

test('PV-PAG: PARITY hit-layer === engine oracle for 1/2/N pages', () => {
  const P = loadPaginator();
  for (const n of [1, 2, 5, 51, 52, 60, 199, 300]) {
    const rh = rows(n);
    const plan = P.paginate(SECS, rh, METRICS);
    const oracle = enginePagesOracle(SECS, rh, METRICS);
    assert.equal(plan.totalPages, oracle.length, `page count mismatch n=${n}`);
    for (let i = 0; i < oracle.length; i++) {
      assert.equal(plan.pages[i].rowStart, oracle[i].rowStart, `rowStart mismatch n=${n} page=${i}`);
      assert.equal(plan.pages[i].rowEnd, oracle[i].rowEnd, `rowEnd mismatch n=${n} page=${i}`);
    }
  }
});

test('PV-PAG: PARITY holds across margins/pageH variation', () => {
  const P = loadPaginator();
  for (const m of [{ pageH: 1123, mTop: 45, mBot: 45 }, { pageH: 1000, mTop: 20, mBot: 20 }, { pageH: 1400, mTop: 0, mBot: 0 }]) {
    for (const n of [10, 80, 250]) {
      const rh = rows(n);
      const plan = P.paginate(SECS, rh, m);
      const oracle = enginePagesOracle(SECS, rh, m);
      assert.equal(plan.totalPages, oracle.length, `count n=${n} ${JSON.stringify(m)}`);
      for (let i = 0; i < oracle.length; i++) {
        assert.equal(plan.pages[i].rowEnd, oracle[i].rowEnd, `rowEnd n=${n} p=${i} ${JSON.stringify(m)}`);
      }
    }
  }
});
