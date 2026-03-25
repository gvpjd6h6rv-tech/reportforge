import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectMulti,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

test('DIAG-006 renderHandles never falls back to single branch during 2-item multiselect drag', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await reloadRuntime(page, server.baseUrl);
    await page.evaluate(() => {
      window.__rfBranchAudit = [];
    });

    await selectMulti(page, 0, 1);

    const target = page.locator('.cr-element.selected').first();
    const box = await target.boundingBox();
    assert.ok(box, 'selected element bounding box missing');

    await page.mouse.move(box.x + 20, box.y + Math.min(8, box.height / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + 34, box.y + Math.min(8, box.height / 2) + 14, { steps: 6 });
    await page.waitForTimeout(120);

    const duringDrag = await page.evaluate(() => ({
      selection: [...DS.selection],
      boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
      branchLog: Array.isArray(window.__rfBranchAudit) ? window.__rfBranchAudit.slice() : [],
    }));

    await page.mouse.up();
    await page.waitForTimeout(120);

    const multiEntries = duringDrag.branchLog.filter((entry) => entry.renderSelectionIds.length === 2);
    assert.deepEqual(duringDrag.selection, ['e101', 'e102']);
    assert.ok(
      multiEntries.every((entry) => entry.branch === 'multi'),
      `DIAG-006: renderSelectionIds=2 must stay on multi branch, got ${JSON.stringify(multiEntries)}`,
    );
    assert.deepEqual(duringDrag.selection, ['e101', 'e102'], `DIAG-006: drag must preserve 2-item selection, got ${JSON.stringify(duringDrag.selection)}`);
    assert.equal(duringDrag.boxCount, 2, `DIAG-006: multi-drag must keep 2 sel-box nodes, got ${duringDrag.boxCount}`);

    await assertNoConsoleErrors(consoleErrors, 'DIAG-006');
  } finally {
    await browser.close();
    await server.stop();
  }
});
