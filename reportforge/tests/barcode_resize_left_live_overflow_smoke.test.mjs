/**
 * RF-BARCODE-RESIZE-ALIGNMENT-PARITY-1 — Bug 1: resizing a barcode element
 * from its LEFT handle makes the rendered barcode visually overflow the
 * box DURING the drag, snapping back to the correct size only on mouseup.
 *
 * Root cause (confirmed live, not hypothesized):
 *   - SelectionInteractionMotion._doResize live-updates the WRAPPER node
 *     (the server-rendered `.cr-barcode` div, located via
 *     SelectionDragPreviewSync.findPreviewRenderNodes) on every
 *     pointermove — left/top/width/height all track the drag in real time.
 *   - But the barcode's actual visual content is a CHILD `<svg
 *     width="{w}" height="{h}">` with those dimensions baked in as
 *     literal attributes by core/render/engines/barcode_renderer.py at the
 *     time of the last full render. The live wrapper resize never touches
 *     that child element, so the SVG keeps its stale (larger) size and —
 *     since nothing clips it — visually sticks out past the new, smaller
 *     wrapper boundary.
 *   - Only on mouseup does SelectionState.saveHistory() fire (patched by
 *     CommandRuntimeInit.js to also call PreviewEngineRenderer.refresh()
 *     while in preview mode), which re-fetches /designer-preview and
 *     rebuilds `.cr-barcode` + its child <svg> from scratch at the correct
 *     size — "se recompone" only then.
 *   - Resizing from the RIGHT handle hits the exact same stale-SVG defect,
 *     but the wrapper's left edge doesn't move, so the (also stale) SVG
 *     stays visually anchored to the same left edge as the box throughout
 *     the drag — making the overflow far less noticeable even though the
 *     underlying bug is identical in both directions.
 *
 * This test captures the MID-DRAG state (before mouseup), not just the
 * final settled state, and asserts the rendered <svg>'s bounding rect
 * never extends past the wrapper's bounding rect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
} from './runtime_harness.mjs';

test('LIVE: barcode resized from the LEFT handle does not visually overflow its box mid-drag, and settles correctly on mouseup', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await page.evaluate(() => {
      const el = mkEl('barcode', 's-ph', 40, 4, 150, 40, { barcodeType: 'code128', content: 'RF-TEST-1234', showText: true });
      DS.setElements([...DS.elements, el], 'test.insertBarcode');
      return el.id;
    });

    await enterPreview(page);
    await page.waitForTimeout(400);

    await page.locator(`#preview-content .pv-el[data-origin-id="${id}"]`).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(200);

    const handle = page.locator('#preview-content .preview-selection-layer .sel-handle[data-pos="w"]');
    const hbox = await handle.boundingBox();
    assert.ok(hbox, 'west (left) resize handle not found for the selected barcode');

    const readRects = () => page.evaluate(() => {
      const node = document.querySelector('#preview-content .preview-render-layer .cr-barcode');
      const svg = node ? node.querySelector('svg') : null;
      return {
        nodeRect: node ? node.getBoundingClientRect() : null,
        svgRect: svg ? svg.getBoundingClientRect() : null,
      };
    });

    // Drag the left handle 40px to the right — shrinks the box from the left,
    // the exact repro from the bug report.
    await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hbox.x + hbox.width / 2 + 40, hbox.y + hbox.height / 2, { steps: 8 });
    await page.waitForTimeout(150);

    const mid = await readRects();
    assert.ok(mid.nodeRect, 'barcode wrapper node not found mid-drag');
    assert.ok(mid.svgRect, 'barcode <svg> not found mid-drag');
    assert.ok(
      mid.svgRect.right <= mid.nodeRect.right + 0.5,
      `BUG: mid-drag barcode <svg> (right=${mid.svgRect.right}) overflows its wrapper box (right=${mid.nodeRect.right}) by ${mid.svgRect.right - mid.nodeRect.right}px`,
    );
    assert.ok(
      mid.svgRect.width <= mid.nodeRect.width + 0.5,
      `BUG: mid-drag barcode <svg> width (${mid.svgRect.width}) is wider than its wrapper box (${mid.nodeRect.width})`,
    );

    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await readRects();
    assert.ok(after.nodeRect && after.svgRect, 'barcode wrapper/svg missing after mouseup');
    assert.ok(
      Math.abs(after.svgRect.width - after.nodeRect.width) < 0.5,
      'after mouseup, barcode <svg> must exactly match the wrapper box width',
    );
    assert.ok(
      after.nodeRect.width < mid.nodeRect.width || after.nodeRect.width <= 110,
      'mouseup must settle to the resized (smaller) width, not silently revert',
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: barcode resized from the RIGHT handle does not visually overflow its box mid-drag (control case)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await page.evaluate(() => {
      const el = mkEl('barcode', 's-ph', 40, 4, 150, 40, { barcodeType: 'code128', content: 'RF-TEST-1234', showText: true });
      DS.setElements([...DS.elements, el], 'test.insertBarcode');
      return el.id;
    });

    await enterPreview(page);
    await page.waitForTimeout(400);

    await page.locator(`#preview-content .pv-el[data-origin-id="${id}"]`).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(200);

    const handle = page.locator('#preview-content .preview-selection-layer .sel-handle[data-pos="e"]');
    const hbox = await handle.boundingBox();
    assert.ok(hbox, 'east (right) resize handle not found for the selected barcode');

    await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hbox.x + hbox.width / 2 - 40, hbox.y + hbox.height / 2, { steps: 8 });
    await page.waitForTimeout(150);

    const mid = await page.evaluate(() => {
      const node = document.querySelector('#preview-content .preview-render-layer .cr-barcode');
      const svg = node ? node.querySelector('svg') : null;
      return { nodeRect: node?.getBoundingClientRect(), svgRect: svg?.getBoundingClientRect() };
    });
    assert.ok(mid.nodeRect && mid.svgRect, 'barcode wrapper/svg missing mid-drag');
    assert.ok(
      mid.svgRect.right <= mid.nodeRect.right + 0.5,
      `BUG: mid-drag (right-handle) barcode <svg> overflows its wrapper box by ${mid.svgRect.right - mid.nodeRect.right}px`,
    );

    await page.mouse.up();
  } finally {
    await browser.close();
    await server.stop();
  }
});
