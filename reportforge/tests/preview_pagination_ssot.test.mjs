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
  let curStart = 0, cy = rhH, count = 0;
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
