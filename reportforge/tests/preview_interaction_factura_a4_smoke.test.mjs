import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('factura_a4 preview interactive smoke', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    const readUiEntries = () => page.evaluate(() => window.RF_UI_TRACE?.getEntries?.() ?? []);
    const clearUiEntries = () => page.evaluate(() => window.RF_UI_TRACE?.clear?.());
    const assertUiEntry = (entry, expected) => {
      assert.ok(entry, `missing UI trace for ${expected.event}`);
      assert.equal(entry.kind, 'ui');
      assert.equal(entry.event, expected.event);
      assert.equal(entry.phase, expected.phase || 'after');
      assert.equal(entry.source, expected.source);
      assert.ok(entry.before, 'UI trace must include before snapshot');
      assert.ok(entry.after, 'UI trace must include after snapshot');
      assert.ok(entry.dom, 'UI trace must include live DOM snapshot');
      if (expected.selection) {
        assert.deepEqual(entry.selection, expected.selection);
      }
      if (expected.focus) {
        assert.ok(entry.after.focusRect, 'UI trace must include focus geometry');
        assert.ok(entry.after.focusStyle, 'UI trace must include focus computed style');
      }
      if (expected.sliderValue !== undefined) {
        assert.equal(entry.after.sliderValue, expected.sliderValue);
        assert.equal(entry.dom.sliderValue, expected.sliderValue);
      }
      if (expected.pctText !== undefined) {
        assert.equal(entry.after.pctText, expected.pctText);
        assert.equal(entry.dom.pctText, expected.pctText);
      }
      if (expected.dsZoom !== undefined) {
        assert.equal(entry.after.dsZoom, expected.dsZoom);
        assert.equal(entry.dom.dsZoom, expected.dsZoom);
      }
      if (expected.visibleElement !== false) {
        assert.ok(entry.after.visibleElement, 'UI trace must resolve a visible element');
        assert.ok(entry.dom.visibleElement, 'live DOM snapshot must resolve a visible element');
      }
    };

    const layoutPath = path.join(__dirname, '..', 'layouts', 'factura_a4.json');
    const layout = JSON.parse(await fs.readFile(layoutPath, 'utf8'));

    await page.evaluate(async (layoutData) => {
      RenderScheduler.flushSync(() => {
        CFG.PAGE_W = layoutData.pageWidth;
        DS._docType = layoutData.docType || 'factura';
        DS._sampleData = (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
        if (layoutData.margins && typeof layoutData.margins === 'object') {
          if (Number.isFinite(layoutData.margins.left)) DS.setPageMarginLeft(layoutData.margins.left, 'facturaA4Smoke.load');
          if (Number.isFinite(layoutData.margins.top)) DS.setPageMarginTop(layoutData.margins.top, 'facturaA4Smoke.load');
        }
        DS.setSections(layoutData.sections.map((section) => ({ ...section })), 'facturaA4Smoke.load');
        DS.setElements(layoutData.elements.map((element) => ({ ...element })), 'facturaA4Smoke.load');
        if (typeof SectionEngine !== 'undefined') SectionEngine.render();
        if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.renderAll();
        if (typeof SelectionEngine !== 'undefined') SelectionEngine.clearSelection();
      }, 'facturaA4Smoke.load');
      if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(1.0);
    }, layout);

    await page.waitForFunction(() => !!document.querySelector('.cr-element[data-id="rh-cust-raz"]'));
    await enterPreview(page);
    const previewEntries = await readUiEntries();
    const previewTrace = previewEntries.filter((entry) => entry.kind === 'ui' && entry.event === 'preview-refresh' && entry.phase === 'after' && entry.source === 'PreviewEngineRenderer.refresh').at(-1);
    assertUiEntry(previewTrace, {
      event: 'preview-refresh',
      source: 'PreviewEngineRenderer.refresh',
      phase: 'after',
      visibleElement: true,
    });
    await clearUiEntries();
    const cleanState = await page.evaluate(() => {
      const selectionLayer = document.querySelector('#preview-content .preview-selection-layer');
      const box = document.querySelector('#preview-content .preview-selection-layer .sel-box');
      const cs = box ? getComputedStyle(box) : null;
      const hs = selectionLayer ? getComputedStyle(selectionLayer) : null;
      return {
        selection: [...DS.selection],
        boxCount: document.querySelectorAll('#preview-content .preview-selection-layer .sel-box').length,
        handleCount: document.querySelectorAll('#preview-content .preview-selection-layer .sel-handle').length,
        guideCount: document.querySelectorAll('#rf-extended-guide-layer .selection-guide').length,
        layerOpacity: hs?.opacity || null,
        boxDisplay: cs?.display || null,
      };
    });
    assert.equal(cleanState.boxCount, 0, 'preview must start without selection boxes');
    assert.equal(cleanState.handleCount, 0, 'preview must start without resize handles');
    assert.equal(cleanState.guideCount, 0, 'preview must start without alignment guides');
    await page.locator('#workspace').screenshot({ path: '/tmp/rf_preview_phase3_before.png', animations: 'disabled' });

    await page.locator('#preview-content .pv-el[data-origin-id="rh-cust-box"]').click();
    await page.waitForTimeout(120);
    let uiEntries = await readUiEntries();
    let selectTrace = uiEntries.filter((entry) => entry.kind === 'ui' && entry.event === 'preview-select' && entry.phase === 'after' && entry.source === 'SelectionOverlay.renderHandles').at(-1);

    const afterClick = await page.evaluate(() => {
      const selectionLayer = document.querySelector('#preview-content .preview-selection-layer');
      const box = document.querySelector('#preview-content .preview-selection-layer .sel-box');
      const boxRect = box ? box.getBoundingClientRect() : null;
      const boxStyle = box ? getComputedStyle(box) : null;
      const layerStyle = selectionLayer ? getComputedStyle(selectionLayer) : null;
      return {
        selection: [...DS.selection],
        boxCount: document.querySelectorAll('#preview-content .preview-selection-layer .sel-box').length,
        handleCount: document.querySelectorAll('#preview-content .preview-selection-layer .sel-handle').length,
        guideCount: document.querySelectorAll('#rf-extended-guide-layer .selection-guide').length,
        layerOpacity: layerStyle?.opacity || null,
        boxDisplay: boxStyle?.display || null,
        boxVisibility: boxStyle?.visibility || null,
        boxOpacity: boxStyle?.opacity || null,
        boxRect: boxRect ? { left: boxRect.left, top: boxRect.top, width: boxRect.width, height: boxRect.height } : null,
      };
    });
    assert.deepEqual(afterClick.selection, ['rh-cust-box']);
    assert.equal(afterClick.boxCount, 1, 'preview click must show one selection box');
    assert.equal(afterClick.handleCount, 8, 'preview click must show eight resize handles');
    assert.equal(afterClick.guideCount, 0, 'preview click must not show guides before drag');
    assert.equal(afterClick.layerOpacity, '1', 'preview overlay layer must be visible once selected');
    assert.equal(afterClick.boxDisplay, 'block', 'selection box must be displayed');
    assert.equal(afterClick.boxVisibility, 'visible', 'selection box must be visible');
    assert.ok(afterClick.boxRect && afterClick.boxRect.width > 0 && afterClick.boxRect.height > 0, 'selection box must have a real bounding box');
    assertUiEntry(selectTrace, {
      event: 'preview-select',
      source: 'SelectionOverlay.renderHandles',
      phase: 'after',
      selection: ['rh-cust-box'],
      visibleElement: true,
    });
    const beforeDrag = await page.evaluate(() => {
      const el = DS.getElementById('rh-cust-box');
      return { x: el.x, y: el.y };
    });
    const dragTarget = page.locator('#preview-content .pv-el[data-origin-id="rh-cust-box"]').first();
    const dragBox = await dragTarget.boundingBox();
    assert.ok(dragBox, 'preview drag target must have a bounding box');
    await page.mouse.move(dragBox.x + 24, dragBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + 42, dragBox.y + 24, { steps: 8 });
    await page.waitForTimeout(120);

    const duringDrag = await page.evaluate(() => {
      const guides = [...document.querySelectorAll('#rf-extended-guide-layer .selection-guide')];
      return {
        guideCount: guides.length,
        visibleGuides: guides.map((guide) => {
          const rect = guide.getBoundingClientRect();
          const style = getComputedStyle(guide);
          return {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            width: rect.width,
            height: rect.height,
          };
        }),
        boxCount: document.querySelectorAll('#preview-content .preview-selection-layer .sel-box').length,
      };
    });
    assert.equal(duringDrag.boxCount, 1, 'preview drag must keep one selection box');
    assert.equal(duringDrag.guideCount, 4, 'preview drag must show four alignment guides');
    for (const guide of duringDrag.visibleGuides) {
      assert.notEqual(guide.display, 'none', 'alignment guide must be displayed');
      assert.notEqual(guide.visibility, 'hidden', 'alignment guide must be visible');
      assert.notEqual(guide.opacity, '0', 'alignment guide must not be transparent');
      assert.ok(guide.width > 0 || guide.height > 0, 'alignment guide must have geometry');
    }
    await page.locator('#workspace').screenshot({ path: '/tmp/rf_preview_phase3_after.png', animations: 'disabled' });
    await page.mouse.up();
    await page.waitForTimeout(160);
    uiEntries = await readUiEntries();
    selectTrace = uiEntries.filter((entry) => entry.kind === 'ui' && entry.event === 'preview-select' && entry.phase === 'after' && entry.source === 'SelectionOverlay.renderHandles').at(-1);
    assertUiEntry(selectTrace, {
      event: 'preview-select',
      source: 'SelectionOverlay.renderHandles',
      phase: 'after',
      selection: ['rh-cust-box'],
      visibleElement: true,
    });

    const afterDrag = await page.evaluate((prev) => {
      const el = DS.getElementById('rh-cust-box');
      return { x: el.x, y: el.y, dx: el.x - prev.x, dy: el.y - prev.y };
    }, beforeDrag);
    assert.ok(afterDrag.dx !== 0 || afterDrag.dy !== 0, 'preview drag must move the model element');

    const afterRelease = await page.evaluate(() => ({
      boxCount: document.querySelectorAll('#preview-content .preview-selection-layer .sel-box').length,
      handleCount: document.querySelectorAll('#preview-content .preview-selection-layer .sel-handle').length,
      guideCount: document.querySelectorAll('#rf-extended-guide-layer .selection-guide').length,
    }));
    assert.equal(afterRelease.boxCount, 1, 'preview release must keep the selection box');
    assert.equal(afterRelease.handleCount, 8, 'preview release must keep resize handles');
    assert.equal(afterRelease.guideCount, 0, 'preview release must hide alignment guides');

    await exitPreview(page);

    const exportCheck = await page.evaluate(async () => {
      const oldCreate = URL.createObjectURL;
      const oldRevoke = URL.revokeObjectURL;
      const oldClick = HTMLAnchorElement.prototype.click;
      let clickCount = 0;
      try {
        URL.createObjectURL = () => 'blob:mock';
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function() { clickCount += 1; };
        const json = CommandRuntimeFile.toJSON();
        await CommandRuntimeFile.exportPDF();
        CommandRuntimeFile.exportJSON();
        return { clickCount, jsonLength: json.length };
      } finally {
        URL.createObjectURL = oldCreate;
        URL.revokeObjectURL = oldRevoke;
        HTMLAnchorElement.prototype.click = oldClick;
      }
    });
    assert.ok(exportCheck.jsonLength > 0, 'export JSON must remain available');
    assert.ok(exportCheck.clickCount >= 2, 'save/export should still trigger download clicks');

    await assertNoConsoleErrors(consoleErrors, 'factura_a4 preview interaction smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});
