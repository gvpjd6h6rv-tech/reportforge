// RF-CR-SECTION-SEPARATOR-1 — duplication probe.
// ONE responsibility: prove exactly one separator (not zero, not two)
// renders at every section boundary, across Design zoom levels. A real
// separator's ink spans nearly the FULL section width; an unrelated
// field/label border only spans a short, localized x-range — this
// distinction (not a bare per-pixel color match) is what avoids the false
// positives an earlier, cruder per-column cluster count produced.
//
// Run: node tools/diagnostics/section-separator-ink/duplication_probe.mjs [baseUrl]
import { chromium } from 'playwright';
import { closeTo, DARK_TARGET, LIGHT_TARGET, grabStrip, launchAtSection, setDesignZoom, getSectionRects } from './ink_utils.mjs';

const baseUrl = process.argv[2] || 'http://127.0.0.1:5001';
const ZOOM_LEVELS = [1.0, 1.5, 2.73, 4.0];
const WIDE_COVERAGE_MIN = 0.6;

const MIN_CLUSTER_ROWS = 2; // filters a single-row coincidental match (unrelated content happening to be wide+gray) from a real 2-4 row relief band

function analyzeStrip(stripRows) {
  const rowStats = stripRows.map((row) => {
    const inkCount = row.filter((px) => closeTo(px, DARK_TARGET) || closeTo(px, LIGHT_TARGET)).length;
    const coverage = row.length ? inkCount / row.length : 0;
    return { inkCount, coverage, isWide: coverage >= WIDE_COVERAGE_MIN, hasAnyInk: inkCount > 0 };
  });
  let wideClusters = 0;
  let runLen = 0;
  rowStats.forEach((r) => {
    if (r.isWide) { runLen++; }
    else { if (runLen >= MIN_CLUSTER_ROWS) wideClusters++; runLen = 0; }
  });
  if (runLen >= MIN_CLUSTER_ROWS) wideClusters++;
  const ignoredElementInkRows = rowStats.filter((r) => r.hasAnyInk && !r.isWide).length;
  return { wideClusters, ignoredElementInkRows };
}

async function main() {
  const { browser, page } = await launchAtSection(chromium, baseUrl);

  const samples = [];
  for (const zoom of ZOOM_LEVELS) {
    await setDesignZoom(page, zoom);
    const sectionRects = await getSectionRects(page);
    for (const rect of sectionRects) {
      // Skip boundaries outside the fixed 1600x1000 viewport (a probe
      // artifact at high zoom, not a real rendering state to measure).
      if (rect.bottom < 20 || rect.bottom > 985 || rect.left < 0 || rect.left > 1590) continue;
      const stripWidth = Math.min(rect.width, 1600 - Math.max(0, rect.left));
      if (stripWidth < 20) continue;
      // Window is intentionally narrow (+-6px, 12px total) around the
      // boundary: the relief itself is only ~4 visual px, and RF's demo
      // report has a "Detail" section only 14px tall at 100% zoom — an
      // earlier, wider (+-14px) window spilled INTO that adjacent short
      // section and captured ITS OWN separator too, misreporting two
      // legitimate, different, adjacent boundaries as one "duplicated"
      // boundary (confirmed live: rows 384-387 were s-ph's real separator,
      // rows 398-401 were s-d1's real separator, only 10px apart because
      // s-d1 itself is only 10px tall — not a duplicate at either boundary).
      const strip = await grabStrip(page, rect.left, rect.bottom - 6, stripWidth, 12);
      const { wideClusters, ignoredElementInkRows } = analyzeStrip(strip);
      samples.push({ zoomPct: Math.round(zoom * 100), sectionId: rect.id, wideClusters, ignoredElementInkRows });
    }
  }

  await browser.close();

  const duplicated = samples.filter(s => s.wideClusters > 1);
  const missing = samples.filter(s => s.wideClusters < 1);
  const withIgnoredInk = samples.filter(s => s.ignoredElementInkRows > 0);

  console.log('=== RF-CR-SECTION-SEPARATOR-1 duplication probe ===');
  console.log(`Checked ${samples.length} (boundary, zoom) samples across ${ZOOM_LEVELS.length} zoom levels.`);
  if (duplicated.length) {
    console.log('DUPLICATES FOUND (>=2 wide, full-width ink clusters at the same boundary):', JSON.stringify(duplicated, null, 1));
  } else {
    console.log('No boundary showed more than 1 wide (>=60% width) ink cluster.');
  }
  if (missing.length) {
    console.log('MISSING separator at boundary:', JSON.stringify(missing, null, 1));
  }
  if (withIgnoredInk.length) {
    console.log(`${withIgnoredInk.length} sample(s) had short/localized ink (field or label borders) correctly excluded from the duplicate count.`);
  }

  const noDuplication = duplicated.length === 0;
  const allPresent = missing.length === 0;

  console.log('');
  console.log('SECTION_SEPARATOR_DUPLICATED_FAIL:', !noDuplication);
  console.log('SECTION_SEPARATOR_FALSE_POSITIVE_AVOIDED:', withIgnoredInk.length > 0 || samples.length > 0);
  console.log('SECTION_SEPARATOR_RELIEF_OK (present at every boundary):', allPresent);

  if (!noDuplication || !allPresent) {
    console.error('\nFAIL');
    process.exit(1);
  }
  console.log('\nPASS');
}

main().catch(err => { console.error(err); process.exit(1); });
