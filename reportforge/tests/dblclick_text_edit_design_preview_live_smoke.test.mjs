/**
 * RF-DESIGN-PREVIEW-DBLCLICK-EDIT-PARITY-1
 *
 * Reported bug: double-clicking a text/field element (repro: "Cliente:",
 * "RUC/CI:", "Dirección:", "Email:" labels in factura_fv1.json's header)
 * does nothing in either Design or Preview — no inline edit mode, no caret.
 *
 * Root causes (confirmed live, not hypothesized — three distinct causes):
 *
 *   1. engines/SelectionInteractionPointer.js's onElementPointerDown() had
 *      `if (e.detail === 2 && ...) startTextEdit(...)`, but `e` there is
 *      always a (normalized) 'pointerdown' event, and PointerEvent.detail
 *      is ALWAYS 0 per the Pointer Events spec — only MouseEvent
 *      click/dblclick track click count. Confirmed live: logging
 *      pointerdown.detail on a real double-click in Chromium gave 0, 0
 *      every time; click.detail correctly gave 1, then 2. This branch was
 *      structurally unreachable in both the central-router and legacy
 *      pointerdown paths. Fixed by wiring a real native 'dblclick'
 *      listener (GlobalEventHandlers.js) instead.
 *
 *   2. startTextEdit() hardcoded `div.querySelector('.el-content')` as the
 *      editable span. Design's .cr-element wraps text in .el-content
 *      (CanvasLayoutElements.js), but the REAL server-rendered Preview node
 *      wraps it in .cr-el-inner (_div() in element_renderers.py) — so even
 *      with cause #1 fixed, Preview's real visible node would never be
 *      found. Fixed by accepting both selectors.
 *
 *      Also: in Preview, the clicked .pv-el is the (invisible, opacity:0)
 *      hit-layer proxy — making IT contenteditable would show no visible
 *      caret at all. Fixed by resolving the REAL visible node in
 *      #preview-content .preview-render-layer (SelectionDragPreviewSync,
 *      already used to keep that layer in sync during drag) and editing
 *      THAT instead.
 *
 *   3. EngineCoreRoutingPointerHelpers.js's dispatchPreviewDown() re-resolved
 *      the clicked node via `document.querySelector('.pv-el[data-origin-id=
 *      "ID"]')` — which for a REPEATING detail-row element (N instances,
 *      one per data row) always returns the FIRST DOM match (row 0)
 *      regardless of which row was actually clicked. That wrong node then
 *      received pointer capture, retargeting every subsequent mouseup/
 *      click/dblclick of that gesture back to row 0 — confirmed live via
 *      an event-by-event elementFromPoint vs e.target trace: pointerdown
 *      targeted row 2 correctly, but mouseup/click/dblclick of the SAME
 *      gesture targeted row 0. Fixed by threading the already-resolved
 *      pvElNode through instead of re-querying.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage, enterPreview } from './runtime_harness.mjs';

const LAYOUT_PATH = '/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/factura_fv1.json';

async function openFactura(page) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('button.tb-icon[data-action="open"]').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(LAYOUT_PATH);
  await page.waitForTimeout(500);
}

test('LIVE: double-click opens inline text edit for static text and field labels in Design (factura_fv1.json)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openFactura(page);
    const loaded = await page.evaluate(() => DS.elements.some((e) => e.id === 'rh-cust-ruc-lbl'));
    assert.ok(loaded, 'factura_fv1.json did not load via the real Abrir flow');

    for (const id of ['rh-cust-ruc-lbl', 'rh-cust-raz']) {
      const box = await page.locator(`.cr-element[data-id="${id}"]`).boundingBox();
      assert.ok(box, `${id}: Design element not found`);
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(150);
      const state = await page.evaluate((id) => {
        const div = document.querySelector(`.cr-element[data-id="${id}"]`);
        const span = div ? div.querySelector('.el-content') : null;
        return {
          isEditing: div ? div.classList.contains('editing') : null,
          contentEditable: span ? span.contentEditable : null,
          isFocused: span ? document.activeElement === span : null,
        };
      }, id);
      assert.equal(state.isEditing, true, `${id}: Design double-click must enter edit mode`);
      assert.equal(state.contentEditable, 'true', `${id}: editable span must become contenteditable`);
      assert.equal(state.isFocused, true, `${id}: editable span must receive focus (caret)`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: double-click opens inline text edit for static text and field labels in Preview (factura_fv1.json)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openFactura(page);
    await enterPreview(page);
    await page.waitForTimeout(400);

    for (const id of ['rh-cust-ruc-lbl', 'rh-cust-raz']) {
      const box = await page.locator(`#preview-content .pv-el[data-origin-id="${id}"]`).boundingBox();
      assert.ok(box, `${id}: Preview hit-layer node not found`);
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(150);
      const state = await page.evaluate((id) => {
        const el = DS.getElementById(id);
        const nodes = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId: el.sectionId });
        const div = nodes[0];
        const span = div ? div.querySelector('.cr-el-inner') : null;
        return {
          found: !!div,
          isEditing: div ? div.classList.contains('editing') : null,
          contentEditable: span ? span.contentEditable : null,
          isFocused: span ? document.activeElement === span : null,
        };
      }, id);
      assert.equal(state.found, true, `${id}: real Preview render-layer node not found`);
      assert.equal(state.isEditing, true, `${id}: Preview double-click must enter edit mode on the REAL visible node`);
      assert.equal(state.contentEditable, 'true', `${id}: real node's editable span must become contenteditable`);
      assert.equal(state.isFocused, true, `${id}: real node's editable span must receive focus (caret)`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: double-click on a repeating detail-row field edits the CORRECT row instance in Preview, not row 0', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openFactura(page);
    await enterPreview(page);
    await page.waitForTimeout(400);

    const box = await page.locator('#preview-content .preview-hit-layer .pv-el[data-origin-id="det-desc"][data-row-index="2"]').boundingBox();
    assert.ok(box, 'detail row 2 hit-layer node not found');
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(150);

    const editing = await page.evaluate(() => {
      const node = document.querySelector('#preview-content .preview-render-layer .editing');
      return node ? { row: node.closest('[data-row]')?.dataset.row, contentEditable: node.querySelector('.cr-el-inner')?.contentEditable } : null;
    });
    assert.ok(editing, 'no editing node found in the real Preview render layer');
    assert.equal(editing.row, '2', `double-click on row 2 must edit row 2, not row ${editing.row}`);
    assert.equal(editing.contentEditable, 'true', 'row 2 editable span must become contenteditable');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: double-click opens inline edit for a special field (type=field) in Design', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await page.evaluate(() => {
      const el = mkEl('field', 's-ph', 4, 4, 150, 14, { fieldPath: '_special.report_name', fieldFmt: null, content: '_special.report_name' });
      DS.setElements([...DS.elements, el], 'test.insertSpecial');
      _canonicalCanvasWriter().renderElement(el);
      return el.id;
    });
    const box = await page.locator(`.cr-element[data-id="${id}"]`).boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(150);
    const state = await page.evaluate((id) => {
      const div = document.querySelector(`.cr-element[data-id="${id}"]`);
      return { isEditing: div?.classList.contains('editing'), ce: div?.querySelector('.el-content')?.contentEditable };
    }, id);
    assert.equal(state.isEditing, true, 'special field double-click must enter edit mode');
    assert.equal(state.ce, 'true', 'special field editable span must become contenteditable');
  } finally {
    await browser.close();
    await server.stop();
  }
});
