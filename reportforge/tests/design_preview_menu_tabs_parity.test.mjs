/**
 * RF-CR-PARITY-MENU-TABS-1: entering/exiting Preview must not alter the
 * app shell's chrome (menubar, tabs) — only the report content inside
 * #preview-content should be affected.
 *
 * Root cause (proven live, not hypothesis): the preview HTML the server
 * returns (reportforge/core/render/engines/advanced_engine.py:_css) is CSS
 * meant for a STANDALONE preview document — it includes an unscoped
 * `*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}` reset.
 * engines/PreviewEngineRendererLayout.js:_applyCleanHtml used to extract
 * that <style> and inject it bare (no @layer) into the MAIN app's <head>.
 * An unlayered stylesheet always wins over ANY @layer-declared rule
 * regardless of selector specificity (CSS cascade spec) — so this reset
 * overrode:
 *   - .menu-item's `padding-inline` (designer/styles/chrome.css, `chrome`
 *     layer) -> menubar items rendered with zero spacing between them
 *     ("ArchivoEdiciónVista..." stuck together) only in Preview.
 *   - .sub-tabs' `margin-inline-start: auto` (chrome.css:312, the rule
 *     that right-aligns the Diseño/Preview tabs) -> tabs collapsed to sit
 *     immediately after the file tabs instead of pinned right, only in
 *     Preview.
 * Both bugs were proven to share this one root cause: the SAME fix
 * (@scope (#preview-content) wrapping the injected styles) resolved both
 * simultaneously, measured live, not assumed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function chromeSnapshot(page) {
  return page.evaluate(() => {
    const mi = document.querySelector('.menu-item');
    const miCs = mi ? getComputedStyle(mi) : null;
    const mbCs = getComputedStyle(document.getElementById('menubar'));
    const tabDesign = document.getElementById('tab-design').getBoundingClientRect();
    const tabPreview = document.getElementById('tab-preview').getBoundingClientRect();
    const subTabsCs = getComputedStyle(document.querySelector('.sub-tabs'));
    return {
      menuItemPaddingInline: miCs.paddingInline,
      menuItemPaddingLeft: miCs.paddingLeft,
      menubarPaddingInline: mbCs.paddingInline,
      subTabsMarginInlineStart: subTabsCs.marginInlineStart,
      tabDesignLeft: tabDesign.left,
      tabPreviewLeft: tabPreview.left,
      bodyMargin: getComputedStyle(document.body).margin,
    };
  });
}

test('LIVE: entering Preview does not alter .menu-item / #menubar / .sub-tabs computed style in the main document', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const before = await chromeSnapshot(page);
    assert.notEqual(before.menuItemPaddingInline, '0px', 'sanity: Design menu-item padding must be non-zero before this test means anything');

    await enterPreview(page);
    await page.waitForTimeout(400);
    const duringPreview = await chromeSnapshot(page);

    assert.equal(duringPreview.menuItemPaddingInline, before.menuItemPaddingInline,
      `Preview must not change .menu-item padding-inline — if the preview CSS reset leaks into the main <head> again, this collapses to 0px (got ${duringPreview.menuItemPaddingInline}, expected ${before.menuItemPaddingInline})`);
    assert.equal(duringPreview.menubarPaddingInline, before.menubarPaddingInline,
      'Preview must not change #menubar padding-inline');
    // .sub-tabs no longer uses margin-inline-start:auto (removed — CR pins
    // Diseño/Vista previa at the LEFT, right after the file tabs, not
    // pushed right; see designer/styles/chrome.css:312). Whatever margin
    // it does resolve to (0 by default now) must stay identical between
    // modes — a few hundredths of a px of float rounding between two
    // independent layout passes is expected and not a regression.
    const beforeMargin = parseFloat(before.subTabsMarginInlineStart);
    const duringMargin = parseFloat(duringPreview.subTabsMarginInlineStart);
    assert.ok(Math.abs(duringMargin - beforeMargin) < 2,
      `Preview must not change .sub-tabs margin-inline-start (got ${duringMargin}px, expected ~${beforeMargin}px)`);
    assert.ok(Math.abs(duringPreview.tabDesignLeft - before.tabDesignLeft) < 5,
      `tab-design must stay at the same x coordinate entering Preview — before=${before.tabDesignLeft}, during=${duringPreview.tabDesignLeft}`);
    assert.ok(Math.abs(duringPreview.tabPreviewLeft - before.tabPreviewLeft) < 5,
      `tab-preview must stay at the same x coordinate entering Preview — before=${before.tabPreviewLeft}, during=${duringPreview.tabPreviewLeft}`);
    // CR-parity position check: real Crystal Reports pins Diseño/Vista
    // previa at the LEFT, immediately after the file tabs (confirmed
    // against a real CR screenshot) — not pushed to the far right. 400px
    // is a generous bound (well left of where the old margin:auto push
    // put it, ~1300px on a 1440px viewport) without hard-coding an exact
    // pixel that would break if the file-tab labels' length changes.
    assert.ok(before.tabDesignLeft < 400, `tab-design must sit near the left, CR-style — got left=${before.tabDesignLeft}`);
    assert.ok(duringPreview.tabDesignLeft < 400, `tab-design must sit near the left in Preview too — got left=${duringPreview.tabDesignLeft}`);

    await exitPreview(page);
    await page.waitForTimeout(300);
    const afterExit = await chromeSnapshot(page);
    assert.equal(afterExit.menuItemPaddingInline, before.menuItemPaddingInline, 'exiting Preview must restore (or rather, never have touched) the original menu-item padding');
    assert.ok(Math.abs(afterExit.tabDesignLeft - before.tabDesignLeft) < 5, 'tab-design must be back at the same x coordinate after exiting Preview');
    assert.ok(Math.abs(afterExit.tabPreviewLeft - before.tabPreviewLeft) < 5, 'tab-preview must be back at the same x coordinate after exiting Preview');

    await assertNoConsoleErrors(consoleErrors, 'preview chrome isolation (menu/tabs)');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: the injected preview stylesheet does not contain an unscoped/unlayered universal selector reaching outside #preview-content', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await enterPreview(page);
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const styleEl = document.getElementById('preview-render-style');
      if (!styleEl) return { exists: false };
      const text = styleEl.textContent || '';
      // Direct static proof: the previously-buggy injection had a bare
      // (non-@scope-wrapped) universal selector as the first non-trivial
      // rule. After the fix, the whole sheet must be wrapped in @scope.
      return {
        exists: true,
        startsWithScope: /^\s*@scope\s*\(\s*#preview-content\s*\)/.test(text),
        textSample: text.slice(0, 80),
      };
    });
    assert.ok(info.exists, '#preview-render-style must exist once in Preview mode');
    assert.ok(info.startsWithScope, `injected preview stylesheet must be wrapped in @scope (#preview-content) { ... } — got: ${info.textSample}`);

    await assertNoConsoleErrors(consoleErrors, 'preview style scoping static check');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Preview report content still renders correctly under the @scope fix (no regression)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await enterPreview(page);
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const renderLayer = document.querySelector('.preview-render-layer');
      const rptPage = renderLayer ? renderLayer.querySelector('.rpt-page') : null;
      const el = renderLayer ? renderLayer.querySelector('.cr-el') : null;
      return {
        rptPageExists: !!rptPage,
        rptPageRect: rptPage ? rptPage.getBoundingClientRect() : null,
        elRect: el ? el.getBoundingClientRect() : null,
        elText: el ? el.textContent.trim() : null,
      };
    });
    assert.ok(info.rptPageExists, '.rpt-page must still render inside the preview render layer');
    assert.ok(info.rptPageRect && info.rptPageRect.width > 0 && info.rptPageRect.height > 0, '.rpt-page must have non-zero size');
    assert.ok(info.elRect && info.elRect.width > 0 && info.elRect.height > 0, 'a rendered report element must have non-zero size (the per-element box model rules still apply inside the scope)');
    assert.ok(info.elText && info.elText.length > 0, 'a rendered report element must have visible text content');

    await assertNoConsoleErrors(consoleErrors, 'preview content render regression check');
  } finally {
    await browser.close();
    await server.stop();
  }
});
