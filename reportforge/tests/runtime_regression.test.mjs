import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  selectMulti,
  selectPreviewSingle,
  selectPreviewMulti,
  getSelectionSnapshot,
  getSingleAlignment,
  getMultiBBox,
  assertRectClose,
  takeWorkspaceScreenshot,
  compareSnapshotBuffer,
  runtimeState,
  assertNoConsoleErrors,
  setZoom,
  enterPreview,
  exitPreview,
  dragSelectedElement,
  dragPreviewSelected,
  resizeFromHandle,
} from './runtime_harness.mjs';

function assertApprox(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, got ${actual}`);
}

test('canonical runtime anti-regression suite', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await t.test('render inicial', async () => {
      const state = await getSelectionSnapshot(page);
      assert.equal(state.elementCount, 46);
      assert.equal(state.uniqueElementIds, 46);
      assert.equal(state.boxCount, 0);
    });

    await t.test('selección simple', async () => {
      await selectSingle(page, 0);
      const state = await getSelectionSnapshot(page);
      assert.deepEqual(state.dsSelection, ['e101']);
      assert.deepEqual(state.domSelected, ['e101']);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 8);
      assert.equal(state.selectionGuideCount, 4);
      assert.equal(state.guideLineCount, 0);
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'simpleSelection');
      const shot = await takeWorkspaceScreenshot(page);
      await compareSnapshotBuffer('runtime-selected-100.png', shot);
    });

    await t.test('multiselección', async () => {
      await selectMulti(page, 0, 1);
      const state = await getSelectionSnapshot(page);
      assert.deepEqual(state.dsSelection, ['e101', 'e102']);
      assert.deepEqual(state.domSelected, ['e101', 'e102']);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 0);
      assert.equal(state.selectionGuideCount, 8);
      assert.equal(state.guideLineCount, 0);
      const bbox = await getMultiBBox(page);
      assertRectClose(bbox.box, bbox.expected, 0.5, 'multiSelection');
    });

    await t.test('drag', async () => {
      await selectSingle(page, 0);
      const before = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, x: el.x, y: el.y };
      });
      await dragSelectedElement(page, 20, 16);
      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        return { x: el.x, y: el.y, dx: el.x - prev.x, dy: el.y - prev.y };
      }, before);
      assertApprox(after.dx, 20, 0.15, 'drag.dx');
      assertApprox(after.dy, 16, 0.15, 'drag.dy');
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'drag');
      const state = await getSelectionSnapshot(page);
      assert.equal(state.selectionGuideCount, 4);
      assert.equal(state.guideLineCount, 0);
    });

    await t.test('resize esquina y lado', async () => {
      const before = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h };
      });
      await resizeFromHandle(page, 'se', 20, 8);
      const corner = await page.evaluate(prev => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, before);
      assert.ok(corner.dw > 0);
      assert.ok(corner.dh > 0);
      let alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'resizeCorner');

      const beforeSide = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h };
      });
      await resizeFromHandle(page, 'e', 12, 0);
      const side = await page.evaluate(prev => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, beforeSide);
      assert.ok(side.dw > 0);
      assert.equal(side.dh, 0);
      alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'resizeSide');
    });

    await t.test('zoom 45 100 200', async () => {
      await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
      await page.waitForTimeout(800);
      await selectSingle(page, 0);
      for (const zoom of [0.45, 1, 2]) {
        await setZoom(page, zoom);
        const state = await runtimeState(page);
        assert.equal(state.zoom, zoom);
        assert.equal(state.boxCount, 1);
        assert.equal(state.handleCount, 8);
        const alignment = await getSingleAlignment(page);
        assertRectClose(alignment.box, alignment.element, zoom < 0.5 ? 1 : 0.5, `zoom-${zoom}`);
      }
      const shot200 = await takeWorkspaceScreenshot(page);
      await compareSnapshotBuffer('runtime-selected-200.png', shot200);
    });

    await t.test('zoom widget sync preserves design/preview independence', async () => {
      await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
      await page.waitForTimeout(800);

      const readZoomUi = () => page.evaluate(() => ({
        zoom: DS.zoom,
        zoomDesign: DS.zoomDesign,
        zoomPreview: DS.zoomPreview,
        previewZoom: DS.previewZoom,
        previewMode: DS.previewMode,
        tbValue: document.getElementById('tb-zoom')?.value,
        tbText: document.getElementById('tb-zoom')?.selectedOptions?.[0]?.textContent,
        zwText: document.getElementById('zw-pct')?.textContent,
        sbText: document.getElementById('sb-zoom')?.textContent,
      }));

      await page.mouse.move(520, 420);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -300);
      await page.keyboard.up('Control');
      await page.waitForTimeout(300);

      let state = await readZoomUi();
      assert.ok(Math.abs(state.zoom - 1.1) < 0.02, `ctrl-wheel design zoom expected≈1.1, got ${state.zoom}`);
      assert.equal(state.previewMode, false);
      assert.equal(state.tbValue, '110%');
      assert.equal(state.tbText, '110%');
      assert.equal(state.zwText, '110%');
      assert.equal(state.sbText, '110%');

      await enterPreview(page);
      state = await readZoomUi();
      assert.equal(state.previewMode, true);
      assert.ok(Math.abs(state.zoomDesign - 1.1) < 0.02, `preview should preserve design zoom≈1.1, got ${state.zoomDesign}`);
      assert.equal(state.tbValue, '100%');
      assert.equal(state.zwText, '100%');
      assert.equal(state.sbText, '100%');

      await setZoom(page, 1.5);
      state = await readZoomUi();
      assert.equal(state.previewMode, true);
      assert.ok(Math.abs(state.previewZoom - 1.5) < 0.02, `preview zoom expected≈1.5, got ${state.previewZoom}`);
      assert.equal(state.tbValue, '150%');
      assert.equal(state.tbText, '150%');
      assert.equal(state.zwText, '150%');
      assert.equal(state.sbText, '150%');

      await exitPreview(page);
      state = await readZoomUi();
      assert.equal(state.previewMode, false);
      assert.ok(Math.abs(state.zoom - 1.1) < 0.02, `design zoom should restore≈1.1, got ${state.zoom}`);
      assert.ok(Math.abs(state.zoomDesign - 1.1) < 0.02, `zoomDesign should stay≈1.1, got ${state.zoomDesign}`);
      assert.equal(state.tbValue, '110%');
      assert.equal(state.tbText, '110%');
      assert.equal(state.zwText, '110%');
      assert.equal(state.sbText, '110%');
    });

    await t.test('zoom widget manual flow 25 100 150', async () => {
      await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
      await page.waitForTimeout(800);

      const captureWidget = async () => {
        const slider = page.locator('#zw-slider');
        const shot = await slider.screenshot({ animations: 'disabled' });
        const state = await page.evaluate(() => {
          const sliderEl = document.getElementById('zw-slider');
          const rect = sliderEl?.getBoundingClientRect();
          return {
            zoom: DS.zoom,
            sliderValue: sliderEl?.value,
            pct: document.getElementById('zw-pct')?.textContent,
            sbText: document.getElementById('sb-zoom')?.textContent,
            tbText: document.getElementById('tb-zoom')?.selectedOptions?.[0]?.textContent,
            rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          };
        });
        return { ...state, shot };
      };

      await page.locator('#zw-out').click();
      await page.locator('#zw-out').click();
      await page.locator('#zw-out').click();
      await page.waitForFunction(() => document.getElementById('zw-pct')?.textContent === '25%');
      const at25 = await captureWidget();

      await page.locator('#zw-in').click();
      await page.locator('#zw-in').click();
      await page.locator('#zw-in').click();
      await page.waitForFunction(() => document.getElementById('zw-pct')?.textContent === '100%');
      const at100 = await captureWidget();

      await page.locator('#zw-in').click();
      await page.locator('#zw-in').click();
      await page.locator('#zw-in').click();
      await page.waitForFunction(() => document.getElementById('zw-pct')?.textContent === '150%');
      const at150 = await captureWidget();

      assert.equal(at25.sliderValue, '25');
      assert.equal(at100.sliderValue, '100');
      assert.equal(at150.sliderValue, '150');
      assert.equal(at25.pct, '25%');
      assert.equal(at100.pct, '100%');
      assert.equal(at150.pct, '150%');
      assert.equal(at25.sbText, '25%');
      assert.equal(at100.sbText, '100%');
      assert.equal(at150.sbText, '150%');
      assert.equal(at25.tbText, '25%');
      assert.equal(at100.tbText, '100%');
      assert.equal(at150.tbText, '150%');
      assert.deepEqual(at25.rect, at100.rect);
      assert.deepEqual(at100.rect, at150.rect);
      assert.ok(!at25.shot.equals(at100.shot), 'zoom slider screenshot must change between 25% and 100%');
      assert.ok(!at100.shot.equals(at150.shot), 'zoom slider screenshot must change between 100% and 150%');

      const startRect = await page.locator('#zw-slider').boundingBox();
      await page.mouse.move(startRect.x + 4, startRect.y + startRect.height / 2);
      await page.mouse.down();
      await page.mouse.move(startRect.x + startRect.width * 0.75, startRect.y + startRect.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      const dragState = await page.evaluate(() => ({
        zoom: DS.zoom,
        pct: document.getElementById('zw-pct')?.textContent,
        sliderValue: document.getElementById('zw-slider')?.value,
      }));
      assert.equal(dragState.pct, `${dragState.sliderValue}%`);
      assert.notEqual(dragState.sliderValue, '150', 'dragging the range must change the slider value');

      await page.mouse.move(520, 420);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -300);
      await page.keyboard.up('Control');
      await page.waitForTimeout(200);
      const wheelState = await page.evaluate(() => ({
        zoom: DS.zoom,
        pct: document.getElementById('zw-pct')?.textContent,
        sliderValue: document.getElementById('zw-slider')?.value,
      }));
      assert.equal(wheelState.pct, `${Math.round(wheelState.zoom * 100)}%`);
      assert.equal(wheelState.sliderValue, `${Math.round(wheelState.zoom * 100)}`);
    });

    await t.test('preview enter exit', async () => {
      await setZoom(page, 1);
      await enterPreview(page);
      let state = await runtimeState(page);
      assert.equal(state.previewMode, true);
      assert.equal(state.previewClass, true);
      assert.ok(state.previewPages >= 1);
      assert.equal(state.boxCount, 0);
      assert.equal(state.handleCount, 0);
      let alignment = await getSingleAlignment(page);
      assert.equal(alignment, null);
      const previewShot = await takeWorkspaceScreenshot(page);
      await compareSnapshotBuffer('runtime-preview.png', previewShot);

      await exitPreview(page);
      state = await runtimeState(page);
      assert.equal(state.previewMode, false);
      assert.deepEqual(state.selection, ['e101']);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 8);
      alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'previewExit');
    });

    await t.test('preview selección simple y múltiple', async () => {
      await setZoom(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 0);
      let state = await getSelectionSnapshot(page);
      assert.deepEqual(state.dsSelection, ['e101']);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 8);
      let alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'previewSingle');

      await selectPreviewMulti(page, 0, 2);
      state = await getSelectionSnapshot(page);
      assert.deepEqual(state.dsSelection, ['e101', 'e103']);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 0);
      const bbox = await getMultiBBox(page);
      assertRectClose(bbox.box, bbox.expected, 0.5, 'previewMulti');
      await exitPreview(page);
    });

    await t.test('preview drag', async () => {
      await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
      await page.waitForTimeout(800);
      await setZoom(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 0);
      const beforeDrag = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, x: el.x, y: el.y, w: el.w, h: el.h };
      });
      await dragPreviewSelected(page, 16, 12);
      let after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        return { x: el.x, y: el.y, dx: el.x - prev.x, dy: el.y - prev.y };
      }, beforeDrag);
      assertApprox(after.dx, 16, 0.15, 'previewDrag.dx');
      assertApprox(after.dy, 12, 0.15, 'previewDrag.dy');
      let alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'previewDrag');
      await exitPreview(page);
    });

    await t.test('preview zoom 45 100 200', async () => {
      await setZoom(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 0);
      for (const zoom of [0.45, 1, 2]) {
        await setZoom(page, zoom);
        const state = await page.evaluate(() => ({
          previewMode: DS.previewMode,
          zoom: DS.previewZoom || 1,
          boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
          handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
        }));
        assert.equal(state.previewMode, true);
        assert.equal(state.zoom, zoom);
        assert.equal(state.boxCount, 1);
        assert.equal(state.handleCount, 8);
        const alignment = await getSingleAlignment(page);
        assertRectClose(alignment.box, alignment.element, zoom < 0.5 ? 1 : 0.5, `previewZoom-${zoom}`);
      }
      await exitPreview(page);
    });

    await t.test('secuencia encadenada', async () => {
      await page.evaluate(() => {
        DS.selectOnly('e101', 'test');
        SelectionEngine.renderHandles();
      });
      await page.waitForTimeout(120);
      await dragSelectedElement(page, 10, 8);
      await setZoom(page, 2);
      await enterPreview(page);
      await exitPreview(page);
      await setZoom(page, 1);
      const state = await runtimeState(page);
      const selection = await getSelectionSnapshot(page);
      assert.equal(state.previewMode, false);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 8);
      assert.equal(selection.elementCount, 46);
      assert.equal(selection.uniqueElementIds, 46);
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'sequence');
    });

    await assertNoConsoleErrors(consoleErrors, 'canonical runtime anti-regression suite');
  } finally {
    await browser.close();
    await server.stop();
  }
});
