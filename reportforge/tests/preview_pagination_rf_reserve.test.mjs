// RF-PREVIEW-OVERLAY-PAGINATE-1 — the hit-layer pagination (PreviewPagination
// Engine) must match the server (_pages) so page N of the hit layer maps to
// page N of the render layer. The missing piece was reserving the report
// footer (rf) height on the last page, mirroring advanced_engine._pages
// RF-PAGINATION-RF-HEIGHT-1. Pure function -> unit tested here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../../engines/PreviewPaginationEngine.js'); // sets globalThis.PreviewPaginationEngine
const { paginate } = globalThis.PreviewPaginationEngine;

// 5 report sections (Encabezado/rh, Cabecera detalle/ph, Detalle/det,
// Pie de pagina/pf, Resumen/rf) — the factura shape.
const SECTIONS = [
  { stype: 'rh', height: 400 },
  { stype: 'ph', height: 30 },
  { stype: 'det', height: 14, iterates: 'items' },
  { stype: 'pf', height: 6 },
  { stype: 'rf', height: 246 },
];
const METRICS = { pageH: 1123, mTop: 56, mBot: 56 };
// usable = 1123-56-56-30-6 = 975 ; page1 avail = 975-400 = 575 -> 41 rows
const rows = (n) => Array.from({ length: n }, () => ({ height: 14 }));

test('rf that does NOT fit on the last row-page forces a trailing page', () => {
  // 41 (page1) + 53 (page2 rows) => 53*14=742; 742+246=988 > 975 -> extra page
  const plan = paginate(SECTIONS, rows(94), METRICS);
  assert.equal(plan.totalPages, 3);
  const last = plan.pages[2];
  assert.equal(last.rowStart, 94);
  assert.equal(last.rowEnd, 94); // rf-only trailing page
  assert.equal(last.last, true);
});

test('rf that DOES fit stays on the last row-page (no extra page)', () => {
  // 41 + 52 rows => 52*14=728; 728+246=974 <= 975 -> fits, 2 pages
  const plan = paginate(SECTIONS, rows(93), METRICS);
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[1].rowEnd, 93);
});

test('no rf section -> no trailing reservation page', () => {
  const noRf = SECTIONS.filter((s) => s.stype !== 'rf');
  const plan = paginate(noRf, rows(94), METRICS);
  // 41 + 53 rows both fit without rf -> 2 pages, last holds the tail rows
  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[1].rowEnd, 94);
});

test('single page: rf fits with the rows -> 1 page', () => {
  const plan = paginate(SECTIONS, rows(10), METRICS);
  assert.equal(plan.totalPages, 1);
  assert.equal(plan.pages[0].first, true);
  assert.equal(plan.pages[0].last, true);
});

test('N-page safe: >=5 pages split like the server formula (no magic offset)', () => {
  // usable=975; page1 avail=575 -> 41 rows; other pages avail=975 -> 69 rows.
  // 350 rows -> 41, 69, 69, 69, 69, 33 => 6 pages (rf fits on the 33-row page).
  const plan = paginate(SECTIONS, rows(350), METRICS);
  assert.equal(plan.totalPages, 6);
  const bounds = plan.pages.map((p) => [p.rowStart, p.rowEnd]);
  assert.deepEqual(bounds, [[0, 41], [41, 110], [110, 179], [179, 248], [248, 317], [317, 350]]);
  assert.equal(plan.pages[0].first, true);
  assert.equal(plan.pages[5].last, true);
});

test('doubling rows never desyncs the split boundaries (page 10 aligns like page 1)', () => {
  const a = paginate(SECTIONS, rows(700), METRICS);
  assert.ok(a.totalPages >= 10, `expected >=10 pages, got ${a.totalPages}`);
  // every non-first page carries exactly 69 rows until the tail -> uniform,
  // no accumulated drift across pages.
  for (let i = 1; i < a.totalPages - 1; i++) {
    assert.equal(a.pages[i].rowEnd - a.pages[i].rowStart, 69, `page ${i} width drifted`);
  }
});
