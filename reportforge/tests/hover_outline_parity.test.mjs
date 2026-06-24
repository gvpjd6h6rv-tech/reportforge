/**
 * CR-HOVER-OUTLINE-PARITY-1
 *
 * Crystal Reports shows a thin orange hairline box around whatever
 * element the mouse is hovering, in both Design and Preview. No floating
 * text, no tooltip, no title attribute, no popover. If the hovered
 * element is the active selection, the selection's blue box wins and no
 * orange outline is shown. Hover must not alter layout (uses CSS
 * `outline`, which reserves no box) and must not interfere with
 * click/drag/resize/multiselect/undo-redo.
 *
 * Owner: single shared rule `.cr-element:hover:not(.selected)` in
 * designer/styles/elements-selection.css — applies to both Design's own
 * .cr-element nodes and Preview's hit-layer .pv-el.cr-element nodes via
 * the shared class. `.selected` is kept in sync on both by
 * SelectionOverlay.js:_syncSelectionDomClasses() on every renderHandles().
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  selectPreviewSingle,
  setZoom,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function firstElementCenter(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: el.dataset.id };
  }, selector);
}

test('LIVE: Design — hover shows a thin orange outline, mouseout removes it', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);

    const target = await firstElementCenter(page, '.cr-element');
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(50);

    const hoverOutline = await page.evaluate((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      const cs = getComputedStyle(el);
      return { outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, selected: el.classList.contains('selected') };
    }, target.id);
    assert.equal(hoverOutline.outlineStyle, 'solid', 'hovering an unselected element must show a solid outline');
    assert.notEqual(hoverOutline.outlineWidth, '0px', 'hover outline must be a non-zero hairline');
    assert.equal(hoverOutline.selected, false, 'sanity: target must not be selected during this assertion');

    await page.mouse.move(5, 5);
    await page.waitForTimeout(50);
    const afterMouseout = await page.evaluate((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      return getComputedStyle(el).outlineStyle;
    }, target.id);
    assert.equal(afterMouseout, 'none', 'moving the mouse away must remove the orange outline');

    await assertNoConsoleErrors(consoleErrors);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Design — selecting the hovered element shows blue (selected wins, no orange)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);

    const target = await firstElementCenter(page, '.cr-element');
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(30);
    await selectSingle(page, 0);
    await page.waitForTimeout(50);

    const afterSelect = await page.evaluate((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      return { outlineStyle: getComputedStyle(el).outlineStyle, selected: el.classList.contains('selected'), selBoxCount: document.querySelectorAll('#handles-layer .sel-box').length };
    }, target.id);
    assert.equal(afterSelect.selected, true, 'click must select the element');
    assert.equal(afterSelect.outlineStyle, 'none', 'a selected element must not also show the orange hover outline');
    assert.equal(afterSelect.selBoxCount, 1, 'the blue selection box must be the one shown');

    await assertNoConsoleErrors(consoleErrors);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Preview — hover shows the orange outline on the hit-layer element, click/select does not break it', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);
    await enterPreview(page);
    await page.waitForTimeout(300);

    const target = await firstElementCenter(page, '#preview-content .preview-hit-layer .pv-el');
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(50);

    const hover = await page.evaluate((id) => {
      const el = document.querySelector(`#preview-content .preview-hit-layer .pv-el[data-id="${id}"]`);
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor };
    }, target.id);
    assert.equal(hover.outlineStyle, 'solid', 'hovering an unselected preview field must show a solid outline');

    await selectPreviewSingle(page, 0);
    await page.waitForTimeout(80);
    const afterSelect = await page.evaluate((id) => {
      const el = document.querySelector(`#preview-content .preview-hit-layer .pv-el[data-id="${id}"]`);
      return { outlineStyle: getComputedStyle(el).outlineStyle, selected: el.classList.contains('selected'), selBoxCount: document.querySelectorAll('.preview-selection-layer .sel-box, #handles-layer .sel-box').length };
    }, target.id);
    assert.equal(afterSelect.selected, true, 'preview click must mark the hit-layer node selected');
    assert.equal(afterSelect.outlineStyle, 'none', 'a selected preview field must not also show the orange hover outline');
    assert.equal(afterSelect.selBoxCount, 1, 'exactly one blue selection box must be shown in preview');

    await exitPreview(page);
    await assertNoConsoleErrors(consoleErrors);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: no tooltip/title/popover DOM is ever created by hovering, in either mode', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);

    const target = await firstElementCenter(page, '.cr-element');
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(80);

    const designLeak = await page.evaluate(() => ({
      tooltipNode: !!document.getElementById('field-hover-tooltip'),
      titleAttr: document.querySelector('.cr-element[title]') ? true : false,
      popover: document.querySelector('[popover]') ? true : false,
    }));
    assert.equal(designLeak.tooltipNode, false, 'no #field-hover-tooltip node must exist in Design');
    assert.equal(designLeak.titleAttr, false, 'no title attribute must be added to a hovered element in Design');
    assert.equal(designLeak.popover, false, 'no [popover] element must exist in Design');

    await enterPreview(page);
    await page.waitForTimeout(300);
    const pTarget = await firstElementCenter(page, '#preview-content .preview-hit-layer .pv-el');
    await page.mouse.move(pTarget.x, pTarget.y);
    await page.waitForTimeout(80);
    const previewLeak = await page.evaluate(() => ({
      tooltipNode: !!document.getElementById('field-hover-tooltip'),
      titleAttr: document.querySelector('.pv-el[title]') ? true : false,
      popover: document.querySelector('[popover]') ? true : false,
    }));
    assert.equal(previewLeak.tooltipNode, false, 'no #field-hover-tooltip node must exist in Preview');
    assert.equal(previewLeak.titleAttr, false, 'no title attribute must be added to a hovered element in Preview');
    assert.equal(previewLeak.popover, false, 'no [popover] element must exist in Preview');

    await exitPreview(page);
    await assertNoConsoleErrors(consoleErrors);
  } finally {
    await browser.close();
    await server.stop();
  }
});
