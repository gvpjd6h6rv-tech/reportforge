import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// Selects a single element and rebuilds the properties panel in the page context.
// Uses DS.selectOnly + PropertiesEngine.render() to avoid click-routing overhead.
// Returns the element's model snapshot (id, type, and all scalar properties).
async function selectAndRenderPanel(page, id) {
  const el = await page.evaluate((elId) => {
    DS.selectOnly(elId);
    PropertiesEngine.render();
    const e = DS.elements.find((x) => x.id === elId);
    if (!e) return null;
    // Shallow-copy only serialisable properties
    return {
      id: e.id, type: e.type, sectionId: e.sectionId,
      x: e.x, y: e.y, w: e.w, h: e.h,
      content: e.content, fieldPath: e.fieldPath, fieldFmt: e.fieldFmt ?? '',
      fontFamily: e.fontFamily, fontSize: e.fontSize,
      bold: e.bold, italic: e.italic, underline: e.underline,
      align: e.align, borderWidth: e.borderWidth,
    };
  }, id);
  // Let setTimeout(0) event-listener registrations from _inputRow / _selectRow fire.
  await page.waitForTimeout(50);
  return el;
}

test('TANDA 9 — PANEL-001..020', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
    try {
      await reloadRuntime(page, server.baseUrl);

      // ─── PANEL-001 ──────────────────────────────────────────────────────
      await t.test('PANEL-001 no selection: #props-empty visible, #props-form hidden', async () => {
        await reloadRuntime(page, server.baseUrl);
        // Ensure nothing is selected
        await page.evaluate(() => { DS.clearSelectionState(); PropertiesEngine.render(); });
        await page.waitForTimeout(50);

        const state = await page.evaluate(() => ({
          formHidden: document.getElementById('props-form')?.classList.contains('hidden') ?? true,
          emptyDisplay: window.getComputedStyle(document.getElementById('props-empty')).display,
        }));
        assert.ok(state.formHidden, 'PANEL-001: #props-form must have hidden class when no selection');
        assert.notEqual(state.emptyDisplay, 'none', 'PANEL-001: #props-empty must be visible when no selection');
      });

      // ─── PANEL-002 ──────────────────────────────────────────────────────
      await t.test('PANEL-002 select field element: #props-form shown, #props-empty hidden', async () => {
        await reloadRuntime(page, server.baseUrl);
        const fieldId = await page.evaluate(() => DS.elements.find((e) => e.type === 'field')?.id ?? null);
        assert.ok(fieldId, 'PANEL-002: template must have a field element');
        await selectAndRenderPanel(page, fieldId);

        const state = await page.evaluate(() => ({
          formHidden: document.getElementById('props-form')?.classList.contains('hidden') ?? true,
          emptyDisplay: window.getComputedStyle(document.getElementById('props-empty')).display,
        }));
        assert.ok(!state.formHidden, 'PANEL-002: #props-form must not have hidden class when element selected');
        assert.equal(state.emptyDisplay, 'none', 'PANEL-002: #props-empty must be hidden when element selected');
      });

      // ─── PANEL-003 ──────────────────────────────────────────────────────
      await t.test('PANEL-003 field element: #prop-field-path value matches element fieldPath', async () => {
        await reloadRuntime(page, server.baseUrl);
        const fieldId = await page.evaluate(() => DS.elements.find((e) => e.type === 'field')?.id ?? null);
        assert.ok(fieldId, 'PANEL-003: template must have a field element');
        const el = await selectAndRenderPanel(page, fieldId);

        const inputVal = await page.evaluate(() => document.getElementById('prop-field-path')?.value ?? null);
        assert.ok(inputVal !== null, 'PANEL-003: #prop-field-path must exist for field element');
        assert.equal(inputVal, el.fieldPath, `PANEL-003: input value "${inputVal}" != element.fieldPath "${el.fieldPath}"`);
      });

      // ─── PANEL-004 ──────────────────────────────────────────────────────
      await t.test('PANEL-004 field element: #prop-field-fmt value matches element fieldFmt', async () => {
        await reloadRuntime(page, server.baseUrl);
        const fieldId = await page.evaluate(() => DS.elements.find((e) => e.type === 'field')?.id ?? null);
        assert.ok(fieldId, 'PANEL-004: template must have a field element');
        const el = await selectAndRenderPanel(page, fieldId);

        const inputVal = await page.evaluate(() => document.getElementById('prop-field-fmt')?.value ?? null);
        assert.ok(inputVal !== null, 'PANEL-004: #prop-field-fmt must exist for field element');
        assert.equal(inputVal, el.fieldFmt, `PANEL-004: #prop-field-fmt value "${inputVal}" != element.fieldFmt "${el.fieldFmt}"`);
      });

      // ─── PANEL-005 ──────────────────────────────────────────────────────
      await t.test('PANEL-005 text element: #prop-text-content value matches element content', async () => {
        await reloadRuntime(page, server.baseUrl);
        const textId = await page.evaluate(() => DS.elements.find((e) => e.type === 'text')?.id ?? null);
        assert.ok(textId, 'PANEL-005: template must have a text element');
        const el = await selectAndRenderPanel(page, textId);

        const inputVal = await page.evaluate(() => document.getElementById('prop-text-content')?.value ?? null);
        assert.ok(inputVal !== null, 'PANEL-005: #prop-text-content must exist for text element');
        assert.equal(inputVal, el.content ?? '', `PANEL-005: input "${inputVal}" != element.content "${el.content}"`);
      });

      // ─── PANEL-006 ──────────────────────────────────────────────────────
      await t.test('PANEL-006 #prop-x value matches element x after selection', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-006: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const inputVal = await page.evaluate(() => parseInt(document.getElementById('prop-x')?.value ?? '-1'));
        assert.equal(inputVal, el.x, `PANEL-006: #prop-x="${inputVal}" != element.x="${el.x}"`);
      });

      // ─── PANEL-007 ──────────────────────────────────────────────────────
      await t.test('PANEL-007 #prop-y value matches element y after selection', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-007: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const inputVal = await page.evaluate(() => parseInt(document.getElementById('prop-y')?.value ?? '-1'));
        assert.equal(inputVal, el.y, `PANEL-007: #prop-y="${inputVal}" != element.y="${el.y}"`);
      });

      // ─── PANEL-008 ──────────────────────────────────────────────────────
      await t.test('PANEL-008 changing #prop-x updates element x in DS model', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-008: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const newX = el.x + 20;
        await page.evaluate((val) => {
          const inp = document.getElementById('prop-x');
          inp.value = val;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(newX));
        await page.waitForTimeout(100);

        const updatedX = await page.evaluate((id) => DS.elements.find((e) => e.id === id)?.x, elId);
        assert.equal(updatedX, newX, `PANEL-008: element.x must update to ${newX} after #prop-x change, got ${updatedX}`);
      });

      // ─── PANEL-009 ──────────────────────────────────────────────────────
      await t.test('PANEL-009 changing #prop-w updates element w in DS model and saves history', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-009: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);
        const histBefore = await page.evaluate(() => DS.historyIndex);

        const newW = el.w + 15;
        await page.evaluate((val) => {
          const inp = document.getElementById('prop-w');
          inp.value = val;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(newW));
        await page.waitForTimeout(100);

        const { updatedW, histAfter } = await page.evaluate((id) => ({
          updatedW: DS.elements.find((e) => e.id === id)?.w,
          histAfter: DS.historyIndex,
        }), elId);
        assert.equal(updatedW, newW, `PANEL-009: element.w must update to ${newW}, got ${updatedW}`);
        assert.ok(histAfter > histBefore, `PANEL-009: history must be saved after #prop-w change; before=${histBefore} after=${histAfter}`);
      });

      // ─── PANEL-010 ──────────────────────────────────────────────────────
      await t.test('PANEL-010 changing #prop-h updates element h in DS model', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-010: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const newH = el.h + 10;
        await page.evaluate((val) => {
          const inp = document.getElementById('prop-h');
          inp.value = val;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(newH));
        await page.waitForTimeout(100);

        const updatedH = await page.evaluate((id) => DS.elements.find((e) => e.id === id)?.h, elId);
        assert.equal(updatedH, newH, `PANEL-010: element.h must update to ${newH}, got ${updatedH}`);
      });

      // ─── PANEL-011 ──────────────────────────────────────────────────────
      await t.test('PANEL-011 #prop-section options contain all DS.sections IDs', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-011: template must have at least one element');
        await selectAndRenderPanel(page, elId);

        const { optionValues, sectionIds } = await page.evaluate(() => ({
          optionValues: [...document.querySelectorAll('#prop-section option')].map((o) => o.value),
          sectionIds: DS.sections.map((s) => s.id),
        }));
        for (const sid of sectionIds) {
          assert.ok(optionValues.includes(sid), `PANEL-011: #prop-section must have option for section ${sid}`);
        }
        assert.equal(optionValues.length, sectionIds.length, `PANEL-011: option count ${optionValues.length} != section count ${sectionIds.length}`);
      });

      // ─── PANEL-012 ──────────────────────────────────────────────────────
      await t.test('PANEL-012 x change via panel is undoable via DS.undo()', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-012: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);
        const originalX = el.x;

        await page.evaluate((val) => {
          const inp = document.getElementById('prop-x');
          inp.value = val;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(originalX + 30));
        await page.waitForTimeout(100);

        const xAfterChange = await page.evaluate((id) => DS.elements.find((e) => e.id === id)?.x, elId);
        assert.equal(xAfterChange, originalX + 30, `PANEL-012: x must be updated before undo, got ${xAfterChange}`);

        await page.evaluate(() => DS.undo());
        await page.waitForTimeout(150);

        const xAfterUndo = await page.evaluate((id) => DS.elements.find((e) => e.id === id)?.x, elId);
        assert.equal(xAfterUndo, originalX, `PANEL-012: DS.undo() must restore x to ${originalX}, got ${xAfterUndo}`);
      });

      // ─── PANEL-013 ──────────────────────────────────────────────────────
      await t.test('PANEL-013 clearing selection via DS.clearSelectionState + PropertiesEngine.render hides form', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-013: template must have at least one element');
        await selectAndRenderPanel(page, elId);

        // Confirm panel was showing before clear
        const formShownBefore = await page.evaluate(() => !document.getElementById('props-form')?.classList.contains('hidden'));
        assert.ok(formShownBefore, 'PANEL-013: panel must be visible before clearing selection');

        // Clear selection and re-render
        await page.evaluate(() => { DS.clearSelectionState(); PropertiesEngine.render(); });
        await page.waitForTimeout(50);

        const formHiddenAfter = await page.evaluate(() => document.getElementById('props-form')?.classList.contains('hidden') ?? true);
        assert.ok(formHiddenAfter, 'PANEL-013: #props-form must have hidden class after selection cleared');
      });

      // ─── PANEL-014 ──────────────────────────────────────────────────────
      await t.test('PANEL-014 #prop-font-size value matches element fontSize', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-014: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const inputVal = await page.evaluate(() => parseInt(document.getElementById('prop-font-size')?.value ?? '-1'));
        assert.equal(inputVal, el.fontSize, `PANEL-014: #prop-font-size="${inputVal}" != element.fontSize="${el.fontSize}"`);
      });

      // ─── PANEL-015 ──────────────────────────────────────────────────────
      await t.test('PANEL-015 #prop-bold checked state matches element bold flag', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-015: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const checked = await page.evaluate(() => document.getElementById('prop-bold')?.checked ?? null);
        assert.ok(checked !== null, 'PANEL-015: #prop-bold must exist in panel');
        assert.equal(checked, !!el.bold, `PANEL-015: #prop-bold.checked="${checked}" != !!element.bold="${!!el.bold}"`);
      });

      // ─── PANEL-016 ──────────────────────────────────────────────────────
      await t.test('PANEL-016 #prop-font-family value matches element fontFamily', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-016: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const inputVal = await page.evaluate(() => document.getElementById('prop-font-family')?.value ?? null);
        assert.ok(inputVal !== null, 'PANEL-016: #prop-font-family must exist in panel');
        assert.equal(inputVal, el.fontFamily, `PANEL-016: #prop-font-family="${inputVal}" != element.fontFamily="${el.fontFamily}"`);
      });

      // ─── PANEL-017 ──────────────────────────────────────────────────────
      await t.test('PANEL-017 alignment button matching element.align has class active', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-017: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const activeAlign = await page.evaluate(() => {
          const active = document.querySelector('[data-prop-align].active');
          return active?.dataset.propAlign ?? null;
        });
        assert.ok(activeAlign !== null, 'PANEL-017: at least one [data-prop-align] button must have class active');
        assert.equal(activeAlign, el.align, `PANEL-017: active alignment button "${activeAlign}" != element.align "${el.align}"`);
      });

      // ─── PANEL-018 ──────────────────────────────────────────────────────
      await t.test('PANEL-018 rect element: no #prop-text-content and no #prop-field-path in panel', async () => {
        await reloadRuntime(page, server.baseUrl);
        const rectId = await page.evaluate(() => DS.elements.find((e) => e.type === 'rect')?.id ?? null);
        assert.ok(rectId, 'PANEL-018: template must have a rect element');
        await selectAndRenderPanel(page, rectId);

        const { hasText, hasField } = await page.evaluate(() => ({
          hasText: !!document.getElementById('prop-text-content'),
          hasField: !!document.getElementById('prop-field-path'),
        }));
        assert.ok(!hasText, 'PANEL-018: rect element must not have #prop-text-content in panel');
        assert.ok(!hasField, 'PANEL-018: rect element must not have #prop-field-path in panel');
      });

      // ─── PANEL-019 ──────────────────────────────────────────────────────
      await t.test('PANEL-019 #prop-border-w value matches element borderWidth', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => DS.elements[0]?.id ?? null);
        assert.ok(elId, 'PANEL-019: template must have at least one element');
        const el = await selectAndRenderPanel(page, elId);

        const inputVal = await page.evaluate(() => parseInt(document.getElementById('prop-border-w')?.value ?? '-1'));
        assert.equal(inputVal, el.borderWidth, `PANEL-019: #prop-border-w="${inputVal}" != element.borderWidth="${el.borderWidth}"`);
      });

      // ─── PANEL-020 ──────────────────────────────────────────────────────
      await t.test('PANEL-020 multiselect: #props-form visible, type-specific inputs absent', async () => {
        await reloadRuntime(page, server.baseUrl);
        const { id0, id1 } = await page.evaluate(() => ({
          id0: DS.elements[0]?.id ?? null,
          id1: DS.elements[1]?.id ?? null,
        }));
        assert.ok(id0 && id1, 'PANEL-020: template must have at least 2 elements');

        await page.evaluate(({ a, b }) => {
          DS.selectOnly(a);
          DS.addSelection(b);
          PropertiesEngine.render();
        }, { a: id0, b: id1 });
        await page.waitForTimeout(50);

        const { formHidden, hasText, hasField } = await page.evaluate(() => ({
          formHidden: document.getElementById('props-form')?.classList.contains('hidden') ?? true,
          hasText: !!document.getElementById('prop-text-content'),
          hasField: !!document.getElementById('prop-field-path'),
        }));
        assert.ok(!formHidden, 'PANEL-020: #props-form must be visible with multiselect');
        assert.ok(!hasText, 'PANEL-020: #prop-text-content must be absent in multiselect panel');
        assert.ok(!hasField, 'PANEL-020: #prop-field-path must be absent in multiselect panel');
      });

      await assertNoConsoleErrors(consoleErrors, 'TANDA 9 — PANEL');
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
});
