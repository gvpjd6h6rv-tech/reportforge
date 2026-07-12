/**
 * RF-PREVIEW-DETAIL-VISIBLE-INK-VALIGN-1
 *
 * Diagnostic live smoke for the reported Detail/Preview bug on det-desc.
 * It measures four independent geometries for row 0:
 *   1) real render-layer element box,
 *   2) real visible text ink (DOM Range),
 *   3) hit-layer proxy box,
 *   4) blue selection overlay box.
 *
 * It also exercises the real vertical-alignment toolbar actions in Design and
 * Preview and verifies the full chain: UI action -> DS.valign -> computed
 * align-items -> actual visible text ink position.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage, enterPreview, setZoom } from './runtime_harness.mjs';

const LAYOUT_PATH = '/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/factura_fv1.json';
const ELEMENT_ID = 'det-desc';
const SECTION_ID = 's-det';
const ROW_INDEX = 0;
const RECT_TOLERANCE_PX = 2.5;

async function openFactura(page) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('button.tb-icon[data-action="open"]').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(LAYOUT_PATH);
  await page.waitForTimeout(700);
}

async function clickValignAction(page, mode) {
  await page.locator('#tdd-btn-texto-v').click();
  await page.locator(`#dd-tdd-texto-v [data-action="text-valign-${mode}"]`).click();
  await page.waitForTimeout(250);
}

function pushRectFailures(failures, actual, expected, label) {
  for (const key of ['left', 'top', 'width', 'height', 'right', 'bottom']) {
    const delta = Math.abs(actual[key] - expected[key]);
    if (delta > RECT_TOLERANCE_PX) {
      failures.push(`${label}.${key}: delta=${delta.toFixed(2)} actual=${actual[key].toFixed(2)} expected=${expected[key].toFixed(2)}`);
    }
  }
}

function pushInkAlignmentFailures(failures, sample, expectedMode, label) {
  const expectedAlignItems = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }[expectedMode];

  if (sample.modelValign !== expectedMode) {
    failures.push(`${label}: DS.valign=${sample.modelValign}, expected=${expectedMode}`);
  }
  if (sample.computedAlignItems !== expectedAlignItems) {
    failures.push(`${label}: computed align-items=${sample.computedAlignItems}, expected=${expectedAlignItems}`);
  }

  const topGap = sample.ink.top - sample.element.top;
  const bottomGap = sample.element.bottom - sample.ink.bottom;
  const gapDelta = Math.abs(topGap - bottomGap);

  if (expectedMode === 'top' && !(topGap + RECT_TOLERANCE_PX < bottomGap)) {
    failures.push(`${label}: visible ink is not top-aligned (topGap=${topGap.toFixed(2)}, bottomGap=${bottomGap.toFixed(2)})`);
  }
  if (expectedMode === 'bottom' && !(bottomGap + RECT_TOLERANCE_PX < topGap)) {
    failures.push(`${label}: visible ink is not bottom-aligned (topGap=${topGap.toFixed(2)}, bottomGap=${bottomGap.toFixed(2)})`);
  }
  if (expectedMode === 'middle' && gapDelta > RECT_TOLERANCE_PX * 2) {
    failures.push(`${label}: visible ink is not vertically centered (topGap=${topGap.toFixed(2)}, bottomGap=${bottomGap.toFixed(2)})`);
  }
}

async function selectDesignElement(page) {
  await page.locator(`.cr-element[data-id="${ELEMENT_ID}"]`).click({ position: { x: 8, y: 5 } });
  await page.waitForTimeout(150);
}

async function designInkSample(page) {
  return page.evaluate(({ id }) => {
    const model = DS.getElementById(id);
    const element = document.querySelector(`.cr-element[data-id="${id}"]`);
    const content = element?.querySelector('.el-content');
    const range = document.createRange();
    if (content) range.selectNodeContents(content);
    const er = element?.getBoundingClientRect();
    const ir = content ? range.getBoundingClientRect() : null;
    const rect = (r) => r ? ({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }) : null;
    return {
      modelValign: model?.valign ?? null,
      computedAlignItems: element ? getComputedStyle(element).alignItems : null,
      element: rect(er),
      ink: rect(ir),
    };
  }, { id: ELEMENT_ID });
}

async function selectPreviewRow0(page) {
  const selector = `#preview-content .preview-hit-layer .pv-el[data-origin-id="${ELEMENT_ID}"][data-row-index="${ROW_INDEX}"]`;
  await page.locator(selector).click({ position: { x: 8, y: 5 } });
  await page.waitForTimeout(180);
}

async function previewSample(page) {
  return page.evaluate(({ id, sectionId, rowIndex }) => {
    const idx = DS.elements.filter((e) => e.sectionId === sectionId).findIndex((e) => e.id === id);
    const row = document.querySelector(`#preview-content .preview-render-layer .cr-detail-row[data-row="${rowIndex}"]`);
    const render = row?.querySelector(`[data-el-index="${idx}"]`) || null;
    const inkNode = render?.querySelector('.cr-el-inner') || null;
    const hit = document.querySelector(`#preview-content .preview-hit-layer .pv-el[data-origin-id="${id}"][data-row-index="${rowIndex}"]`);
    const box = document.querySelector('#preview-content .preview-selection-layer .sel-box');
    const model = DS.getElementById(id);
    const range = document.createRange();
    if (inkNode) range.selectNodeContents(inkNode);
    const rect = (r) => r ? ({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }) : null;
    return {
      modelValign: model?.valign ?? null,
      modelHeight: model?.h ?? null,
      computedAlignItems: render ? getComputedStyle(render).alignItems : null,
      render: rect(render?.getBoundingClientRect()),
      ink: rect(inkNode ? range.getBoundingClientRect() : null),
      hit: rect(hit?.getBoundingClientRect()),
      selection: rect(box?.getBoundingClientRect()),
      selectedOriginId: document.querySelector('#preview-content .preview-hit-layer .pv-el.selected')?.dataset?.originId ?? null,
      selectedRowIndex: document.querySelector('#preview-content .preview-hit-layer .pv-el.selected')?.dataset?.rowIndex ?? null,
    };
  }, { id: ELEMENT_ID, sectionId: SECTION_ID, rowIndex: ROW_INDEX });
}

test('LIVE: det-desc row 0 overlay follows full visible render bbox and vertical actions follow visible ink', { timeout: 90000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  const diagnostics = { design: {}, preview: {} };
  const failures = [];

  try {
    await openFactura(page);
    const loaded = await page.evaluate((id) => !!DS.getElementById(id), ELEMENT_ID);
    assert.ok(loaded, `${ELEMENT_ID} not loaded from factura_fv1.json`);

    await setZoom(page, 3.0);
    await selectDesignElement(page);

    for (const mode of ['top', 'middle', 'bottom']) {
      await clickValignAction(page, mode);
      await selectDesignElement(page);
      const sample = await designInkSample(page);
      diagnostics.design[mode] = sample;
      assert.ok(sample.element && sample.ink, `Design ${mode}: missing element or visible ink rect`);
      pushInkAlignmentFailures(failures, sample, mode, `Design ${mode}`);
    }

    await enterPreview(page);
    await setZoom(page, 3.0);

    for (const mode of ['top', 'middle', 'bottom']) {
      await selectPreviewRow0(page);
      await clickValignAction(page, mode);
      await selectPreviewRow0(page);
      const sample = await previewSample(page);
      diagnostics.preview[mode] = sample;

      assert.ok(sample.render, `Preview ${mode}: real render node missing`);
      assert.ok(sample.ink, `Preview ${mode}: visible ink rect missing`);
      assert.ok(sample.hit, `Preview ${mode}: row 0 hit proxy missing`);
      assert.ok(sample.selection, `Preview ${mode}: blue selection box missing`);

      if (sample.selectedOriginId !== ELEMENT_ID || sample.selectedRowIndex !== String(ROW_INDEX)) {
        failures.push(`Preview ${mode}: selected proxy identity lost (origin=${sample.selectedOriginId}, rowIndex=${sample.selectedRowIndex})`);
      }

      pushRectFailures(failures, sample.hit, sample.render, `Preview ${mode} hit-vs-render`);
      pushRectFailures(failures, sample.selection, sample.render, `Preview ${mode} selection-vs-render`);
      pushInkAlignmentFailures(failures, {
        modelValign: sample.modelValign,
        computedAlignItems: sample.computedAlignItems,
        element: sample.render,
        ink: sample.ink,
      }, mode, `Preview ${mode}`);
    }

    if (consoleErrors.length) {
      failures.push(`browser console errors: ${JSON.stringify(consoleErrors)}`);
    }

    assert.deepEqual(
      failures,
      [],
      `RF-PREVIEW-DETAIL-VISIBLE-INK-VALIGN-1 failures:\n${failures.join('\n')}\nDIAGNOSTICS=${JSON.stringify(diagnostics, null, 2)}`,
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});
