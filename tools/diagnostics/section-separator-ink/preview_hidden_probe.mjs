// RF-CR-SECTION-SEPARATOR-1 — Preview-hidden probe.
// ONE responsibility: prove Preview mode shows NO section separator at any
// zoom level (both DOM and raster), and that a Design -> Preview -> Design
// round trip leaves no orphaned or duplicated overlay nodes behind.
//
// Run: node tools/diagnostics/section-separator-ink/preview_hidden_probe.mjs [baseUrl]
import { chromium } from 'playwright';
import { closeTo, DARK_TARGET, LIGHT_TARGET, grabColumn, launchAtSection } from './ink_utils.mjs';

const baseUrl = process.argv[2] || 'http://127.0.0.1:5001';
const ZOOM_LEVELS = [1.0, 1.5, 2.73, 4.0];

function hasThreeBands(rows) {
  const darkRows = rows.filter(px => closeTo(px, DARK_TARGET));
  const lightRows = rows.filter(px => closeTo(px, LIGHT_TARGET));
  return darkRows.length >= 1 && lightRows.length >= 1;
}

async function main() {
  const { browser, page } = await launchAtSection(chromium, baseUrl);

  await page.locator('#tab-preview').click();
  await page.waitForTimeout(500);
  const previewDom = await page.evaluate(() => ({
    lineCount: document.querySelectorAll('.rf-section-sep-line').length,
    stubCount: document.querySelectorAll('.rf-section-sep-ruler-stub').length,
  }));

  const previewResults = [];
  for (const zoom of ZOOM_LEVELS) {
    await page.evaluate((z) => { if (typeof PreviewZoomEngine !== 'undefined') PreviewZoomEngine.set(z); }, zoom);
    await page.waitForTimeout(300);
    const sec = await page.evaluate(() => {
      const s = document.querySelector('.pv-section, .cr-section');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { bottom: r.bottom, left: r.left };
    });
    if (!sec) { previewResults.push({ zoomPct: Math.round(zoom * 100), skipped: true }); continue; }
    const rows = await grabColumn(page, sec.left + 20, sec.bottom - 14, 28);
    previewResults.push({ zoomPct: Math.round(zoom * 100), detected: hasThreeBands(rows) });
  }

  await page.locator('#tab-design').click();
  await page.waitForTimeout(400);
  const backToDesignDom = await page.evaluate(() => ({
    lineCount: document.querySelectorAll('.rf-section-sep-line').length,
    stubCount: document.querySelectorAll('.rf-section-sep-ruler-stub').length,
    sectionCount: DS.sections.filter(s => s.visible !== false).length,
  }));

  await browser.close();

  console.log('=== RF-CR-SECTION-SEPARATOR-1 preview-hidden probe ===');
  console.log('PREVIEW dom on enter:', JSON.stringify(previewDom));
  previewResults.forEach(r => {
    if (r.skipped) { console.log(`zoom=${r.zoomPct}%  (no preview section element found — skipped)`); return; }
    console.log(`zoom=${r.zoomPct}%  bands=${r.detected ? 'DETECTED (should be none!)' : 'none OK'}`);
  });
  console.log('BACK-TO-DESIGN dom:', JSON.stringify(backToDesignDom));

  const previewDomHidden = previewDom.lineCount === 0 && previewDom.stubCount === 0;
  const previewRasterClean = previewResults.every(r => r.skipped || !r.detected);
  const cleanupOk = backToDesignDom.lineCount === backToDesignDom.sectionCount
    && backToDesignDom.stubCount === backToDesignDom.sectionCount;

  console.log('');
  console.log('SECTION_SEPARATOR_HIDDEN_OK:', previewDomHidden);
  console.log('PREVIEW_SECTION_SEPARATOR_HIDDEN_OK:', previewDomHidden && previewRasterClean);
  console.log('PREVIEW_RASTER_NO_SECTION_SEPARATOR:', previewRasterClean);
  console.log('SECTION_SEPARATOR_RESTORE_ON_DESIGN_RETURN (no orphans/dupes):', cleanupOk, `(lines=${backToDesignDom.lineCount}, stubs=${backToDesignDom.stubCount}, sections=${backToDesignDom.sectionCount})`);

  if (!previewDomHidden || !previewRasterClean || !cleanupOk) {
    console.error('\nFAIL');
    process.exit(1);
  }
  console.log('\nPASS');
}

main().catch(err => { console.error(err); process.exit(1); });
