#!/usr/bin/env node
// rf_page_margin_ink_probe.mjs — PAGE-MARGIN-MODEL-01 diagnostic, measure step.
//
// Single responsibility: load each case_*.html (written by
// render_margin_cases.py) in a REAL browser, measure the REAL rendered DOM
// via getBoundingClientRect() (never regex on CSS/HTML source text — that is
// exactly how the original bug hid: the CSS text said one thing, an inline
// style attribute on the actual element won the cascade and the browser
// rendered something else), screenshot with the ink visible, and judge
// PASS/FAIL against the printable-area formula:
//
//   pageX = 0 (sheet's own frame)                 printableX = marginLeft
//   contentFrameWidth = layout pageWidth (671)     printableWidth = contentFrameWidth - marginLeft - marginRight
//   printableRight = printableX + printableWidth  MUST NEVER exceed contentFrameWidth
//   sheetWidth = 794 (true A4 @96dpi, PREVIEW-PDF-PARITY-A4-01) — independent of contentFrameWidth, MUST NEVER change
//
// Does NOT render HTML (render_margin_cases.py's job) and does NOT patch
// the product — read-only diagnostic, screenshots + a PASS/FAIL table.
//
// Usage:
//   python3 render_margin_cases.py /tmp/margin-cases
//   node rf_page_margin_ink_probe.mjs /tmp/margin-cases

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
if (!DIR) {
  console.error('Usage: rf_page_margin_ink_probe.mjs <cases_dir> (output of render_margin_cases.py)');
  process.exit(1);
}

const CONTENT_FRAME_WIDTH = 671; // must match render_margin_cases.py's _PAGE_WIDTH
const SHEET_WIDTH_A4 = 794; // true A4 @96dpi — .rpt-sheet is always this for pageSize:'A4' (PREVIEW-PDF-PARITY-A4-01), regardless of contentFrameWidth
const MM = 3.7795;

const CASES = [
  { name: 'A_left0_right0', left: 0, right: 0 },
  { name: 'B_left100_right0', left: 100, right: 0 },
  { name: 'C_left0_right100', left: 0, right: 100 },
  { name: 'D_left100_right100', left: 100, right: 100 },
  { name: 'E_left176_right0', left: 176, right: 0 }, // exact user-reported case
];

function expected(left, right) {
  const l = Math.round(left * MM);
  const r = Math.round(right * MM);
  return {
    printableX: l,
    printableWidth: Math.max(0, CONTENT_FRAME_WIDTH - l - r),
  };
}

async function measureCase(page, name) {
  const file = path.join(DIR, `case_${name}.html`);
  await page.goto(`file://${file}`, { waitUntil: 'load' });
  const rects = await page.evaluate(() => {
    const sheet = document.querySelector('.rpt-sheet');
    const pg = document.querySelector('.rpt-page');
    return { sheet: sheet.getBoundingClientRect().toJSON(), page: pg.getBoundingClientRect().toJSON() };
  });
  await page.screenshot({ path: path.join(DIR, `case_${name}.png`) });
  return rects;
}

async function run() {
  if (!fs.existsSync(DIR)) {
    console.error(`Directory not found: ${DIR} — run render_margin_cases.py first.`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  const rows = [];
  let anyFail = false;

  for (const c of CASES) {
    const rects = await measureCase(page, c.name);
    const pageX = 0; // sheet's own frame — sheet.left is the screen-space origin, not part of the contract
    const pageWidth = Math.round(rects.sheet.width);
    const printableX = Math.round(rects.page.left - rects.sheet.left);
    const printableWidth = Math.round(rects.page.width);
    const printableRight = printableX + printableWidth;
    const exp = expected(c.left, c.right);

    const pageWidthOk = pageWidth === SHEET_WIDTH_A4; // sheet must NEVER change size
    const printableWidthOk = printableWidth === exp.printableWidth;
    const printableXOk = printableX === exp.printableX;
    const neverEscapesOk = printableRight <= SHEET_WIDTH_A4; // printable area must never escape the physical A4 sheet
    const pass = pageWidthOk && printableWidthOk && printableXOk && neverEscapesOk;
    if (!pass) anyFail = true;

    rows.push({
      case: c.name, left: c.left, right: c.right,
      pageX, pageWidth, printableX, printableWidth, printableRight,
      expectedPrintableX: exp.printableX, expectedPrintableWidth: exp.printableWidth,
      pageWidthOk, printableXOk, printableWidthOk, neverEscapesOk,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  await browser.close();

  console.log(
    'case'.padEnd(22), 'pageX'.padStart(6), 'pageWidth'.padStart(10),
    'printableX'.padStart(11), 'printableW'.padStart(11), 'printableRight'.padStart(15),
    'verdict'.padStart(9),
  );
  for (const r of rows) {
    console.log(
      r.case.padEnd(22), String(r.pageX).padStart(6), String(r.pageWidth).padStart(10),
      String(r.printableX).padStart(11), String(r.printableWidth).padStart(11),
      String(r.printableRight).padStart(15), r.verdict.padStart(9),
    );
  }
  console.log('\n' + JSON.stringify(rows, null, 2));

  if (anyFail) {
    console.error('\nFAIL — see rows above with verdict=FAIL.');
    process.exit(1);
  }
  console.log('\nAll cases PASS — physical sheet constant, printable area follows pageWidth - left - right, never escapes the sheet.');
}

run().catch((err) => { console.error(err); process.exit(1); });
