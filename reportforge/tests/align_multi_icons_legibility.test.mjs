/**
 * RF-CR-PARITY: the multi-select alignment toolbar buttons (align-lefts/
 * centers/rights/tops/bottoms) used to render as two stacked unicode
 * glyphs each (e.g. "⬜◧"), which overlap into visual noise instead of a
 * legible icon — confirmed live via screenshot (classic skin). Fixed to a
 * single glyph per button (designer/crystal-reports-designer-v4.html).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

const ACTIONS = ['align-lefts', 'align-centers', 'align-rights', 'align-tops', 'align-bottoms'];

test('LIVE: multi-select align toolbar buttons render exactly one glyph each (no overlapping double-icon)', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const buttons = await page.evaluate((actions) => {
      return actions.map((action) => {
        const el = document.querySelector(`.tb-icon[data-action="${action}"]`);
        return el ? { action, text: el.textContent, codePoints: [...el.textContent].length } : null;
      });
    }, ACTIONS);

    for (const b of buttons) {
      assert.ok(b, `button for ${b?.action} must exist`);
      assert.equal(b.codePoints, 1, `${b.action} must render exactly one glyph (got "${b.text}", ${b.codePoints} code points) — two stacked glyphs overlap into visual noise`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: align-lefts button still triggers the alignLefts command after the icon fix (functionality unaffected)', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      // Force a real x difference regardless of the loaded fixture's
      // layout (e.g. e101/e102 happen to already share x=4 in the default
      // template) — the point of this test is the click handler wiring,
      // not the fixture's geometry.
      DS.elements[1].x = DS.elements[0].x + 123;
      DS.clearSelectionState('test');
      DS.addSelection(DS.elements[0].id, 'test');
      DS.addSelection(DS.elements[1].id, 'test');
    });
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => [DS.elements[0].x, DS.elements[1].x]);

    await page.click(".tb-icon[data-action=\"align-lefts\"]");
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => [DS.elements[0].x, DS.elements[1].x]);

    assert.equal(after[0], after[1], 'align-lefts must align both selected elements to the same x — button click handler still wired correctly after the icon text change');
    assert.notDeepEqual(before, after, 'alignment must have actually changed at least one element (sanity: the two elements did not already share the same x)');
  } finally {
    await browser.close();
    await server.stop();
  }
});
