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

async function run() {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  const steps = [];

  async function step(name, fn) {
    await fn();
    steps.push(name);
  }

  try {
    await step('render inicial', async () => {
      const state = await getSelectionSnapshot(page);
      assert.equal(state.elementCount, 46);
      assert.equal(state.uniqueElementIds, 46);
      assert.equal(state.boxCount, 0);
    });

    await step('selección simple', async () => {
      await selectSingle(page, 0);
      const state = await getSelectionSnapshot(page);
      assert.deepEqual(state.dsSelection, ['e101']);
      assert.deepEqual(state.domSelected, ['e101']);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 8);
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'simpleSelection');
      const shot = await takeWorkspaceScreenshot(page);
      await compareSnapshotBuffer('runtime-selected-100.png', shot);
    });

    await step('multiselección', async () => {
      await selectMulti(page, 0, 1);
      const state = await getSelectionSnapshot(page);
      assert.deepEqual(state.dsSelection, ['e101', 'e102']);
      assert.deepEqual(state.domSelected, ['e101', 'e102']);
      assert.equal(state.boxCount, 1);
      assert.equal(state.handleCount, 0);
      const bbox = await getMultiBBox(page);
      assertRectClose(bbox.box, bbox.expected, 0.5, 'multiSelection');
    });

    await step('drag', async () => {
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
    });

    await step('resize esquina y lado', async () => {
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

    await step('zoom 45 100 200', async () => {
      await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
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
        assertRectClose(alignment.box, alignment.element, 0.5, `zoom-${zoom}`);
      }
      const shot200 = await takeWorkspaceScreenshot(page);
      await compareSnapshotBuffer('runtime-selected-200.png', shot200);
    });

    await step('preview enter exit', async () => {
      await enterPreview(page);
      let state = await runtimeState(page);
      assert.equal(state.previewMode, true);
      assert.equal(state.previewClass, true);
      assert.ok(state.previewPages >= 1);
      let alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'previewEnterSelection');
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

    await step('preview selección simple y múltiple', async () => {
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

    await step('preview drag y resize', async () => {
      await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
      await page.waitForTimeout(800);
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

      const beforeResize = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, w: el.w, h: el.h };
      });
      await resizeFromHandle(page, 'se', 12, 8);
      let resized = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        const selected = [...DS.selection];
        if (!el) return { missing: true, selected };
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, beforeResize);
      assert.ok(!resized.missing);
      assert.ok(resized.dw > 0);
      assert.ok(resized.dh > 0);
      alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'previewResizeCorner');

      const beforeSide = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, w: el.w, h: el.h };
      });
      await resizeFromHandle(page, 'e', 10, 0);
      resized = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        const selected = [...DS.selection];
        if (!el) return { missing: true, selected };
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, beforeSide);
      assert.ok(!resized.missing);
      assert.ok(resized.dw > 0);
      assert.equal(resized.dh, 0);
      alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'previewResizeSide');
      await exitPreview(page);
    });

    await step('preview zoom 45 100 200', async () => {
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
        assertRectClose(alignment.box, alignment.element, 0.5, `previewZoom-${zoom}`);
      }
      await exitPreview(page);
    });

    await step('secuencia encadenada', async () => {
      await page.evaluate(() => {
        DS.selectOnly('e101');
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
    console.log(`runtime regression: PASS (${steps.length} scenarios)`);
  } finally {
    await browser.close();
    await server.stop();
  }
}

run().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
