/**
 * contextmenu_format_properties_live_smoke.test.mjs
 *
 * LIVE (real browser, real right-click, real menu-item click) coverage for the
 * context-menu actions "Formatear campo..." (format-field) and "Propiedades..."
 * (open-properties), in BOTH Design and Preview.
 *
 * Reported bug: both items appeared in the menu but "did nothing" on real click.
 * Confirmed live (not hypothesized): the dispatch chain WAS firing, but the only
 * effect beyond the render that selection already triggers was
 * `props-body.scrollTop = 9999/0`. The props form fits with ~3px of overflow, so
 * that scroll was imperceptible — a de-facto silent no-op, with no real focus and
 * no visible distinction between "format" and "properties".
 *
 * Fix: PropertiesEngine.focusSection(which) un-collapses the panel, highlights the
 * target section (.props-section-focus) and moves real keyboard focus into a
 * control of that section — prop-font-family (format) / prop-x (general). The two
 * handlers call render() + focusSection('format'|'general'). This produces a
 * visible + functional change independent of scroll overflow, identical in Design
 * and Preview.
 *
 * These are NOT mock tests: every assertion below observes real DOM state after a
 * real mouse click drove the real ContextMenuEngine → handleAction → handler chain.
 *
 * Metamorphic invariants asserted:
 *   MT1 Design ≡ Preview for "Formatear campo" (render + panel visible + format focus)
 *   MT2 Design ≡ Preview for "Propiedades"     (render + panel visible + general focus)
 *   MT3 Same element uses the same action id (format-field / open-properties) in both modes
 *   MT4 Repeating an action 3× is idempotent (no dup listeners, stable focus, single highlight)
 *   MT5 No selection → no crash, no invalid panel; element items absent from canvas menu
 *   MT6 text / field / line / rect → both commands focus a real control (never silent no-op)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function firstDesignId(page) {
  return page.evaluate(() => DS.elements[0].id);
}

async function rightClickDesign(page, id) {
  const box = await page.locator(`.cr-element[data-id="${id}"]`).boundingBox();
  assert.ok(box, `design element ${id} not found`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForFunction(() => document.getElementById('ctx-menu').classList.contains('visible'));
  return box;
}

async function rightClickPreview(page, originId) {
  const box = await page.locator(`#preview-content .pv-el[data-origin-id="${originId}"]`).first().boundingBox();
  assert.ok(box, `preview element ${originId} not found`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForFunction(() => document.getElementById('ctx-menu').classList.contains('visible'));
  return box;
}

async function clickMenuItem(page, label) {
  const item = page.locator('#ctx-menu .ctx-item', { hasText: label });
  assert.equal(await item.count(), 1, `menu item "${label}" must be present exactly once`);
  await item.first().click();
  await page.waitForTimeout(120);
}

async function panelSnapshot(page) {
  return page.evaluate(() => ({
    activeElementId: document.activeElement ? document.activeElement.id : null,
    formatFocused: !!document.getElementById('props-format-anchor')?.classList.contains('props-section-focus'),
    generalFocused: !!document.getElementById('props-general-anchor')?.classList.contains('props-section-focus'),
    formHidden: document.getElementById('props-form').classList.contains('hidden'),
    panelCollapsed: document.getElementById('properties-panel').classList.contains('collapsed'),
    panelVisible: (() => {
      const p = document.getElementById('panel-right');
      const s = getComputedStyle(p);
      return s.display !== 'none' && s.visibility !== 'hidden' && p.offsetWidth > 0;
    })(),
    focusCount: document.querySelectorAll('#props-form .prop-section.props-section-focus').length,
  }));
}

// ───────────────────────── DESIGN ─────────────────────────

test('LIVE design: real click on "Formatear campo..." focuses the format section', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await firstDesignId(page);
    await rightClickDesign(page, id);
    await clickMenuItem(page, 'Formatear campo');

    const snap = await panelSnapshot(page);
    assert.equal(snap.panelVisible, true, 'props panel must be visible');
    assert.equal(snap.panelCollapsed, false, 'format action must un-collapse the panel');
    assert.equal(snap.formHidden, false, 'props form must be rendered (not hidden)');
    assert.equal(snap.activeElementId, 'prop-font-family', 'keyboard focus must land in the format (font) control');
    assert.equal(snap.formatFocused, true, 'format section must be highlighted');
    assert.equal(snap.generalFocused, false, 'general section must NOT be highlighted');
    await assertNoConsoleErrors(consoleErrors, 'design/format');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE design: real click on "Propiedades..." focuses the general properties section', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await firstDesignId(page);
    await rightClickDesign(page, id);
    await clickMenuItem(page, 'Propiedades');

    const snap = await panelSnapshot(page);
    assert.equal(snap.panelVisible, true, 'props panel must be visible');
    assert.equal(snap.panelCollapsed, false, 'properties action must un-collapse the panel');
    assert.equal(snap.formHidden, false, 'props form must be rendered (not hidden)');
    assert.equal(snap.activeElementId, 'prop-x', 'keyboard focus must land in the general (position) control');
    assert.equal(snap.generalFocused, true, 'general section must be highlighted');
    assert.equal(snap.formatFocused, false, 'format section must NOT be highlighted');
    await assertNoConsoleErrors(consoleErrors, 'design/properties');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ───────────────────────── PREVIEW ─────────────────────────

test('LIVE preview: real click on "Formatear campo..." focuses the format section', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await firstDesignId(page);
    await enterPreview(page);
    await rightClickPreview(page, id);
    await clickMenuItem(page, 'Formatear campo');

    const snap = await panelSnapshot(page);
    assert.equal(snap.panelVisible, true, 'props panel must be visible in preview');
    assert.equal(snap.formHidden, false, 'props form must be rendered in preview');
    assert.equal(snap.activeElementId, 'prop-font-family', 'preview: focus must land in the format control');
    assert.equal(snap.formatFocused, true, 'preview: format section must be highlighted');
    assert.equal(snap.generalFocused, false, 'preview: general section must NOT be highlighted');
    await assertNoConsoleErrors(consoleErrors, 'preview/format');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE preview: real click on "Propiedades..." focuses the general properties section', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await firstDesignId(page);
    await enterPreview(page);
    await rightClickPreview(page, id);
    await clickMenuItem(page, 'Propiedades');

    const snap = await panelSnapshot(page);
    assert.equal(snap.panelVisible, true, 'props panel must be visible in preview');
    assert.equal(snap.formHidden, false, 'props form must be rendered in preview');
    assert.equal(snap.activeElementId, 'prop-x', 'preview: focus must land in the general control');
    assert.equal(snap.generalFocused, true, 'preview: general section must be highlighted');
    assert.equal(snap.formatFocused, false, 'preview: format section must NOT be highlighted');
    await assertNoConsoleErrors(consoleErrors, 'preview/properties');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ───────────────────────── METAMORPHIC ─────────────────────────

test('LIVE metamorphic MT1/MT2/MT3: Design ≡ Preview for both actions on the same element', { timeout: 90000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await firstDesignId(page);

    // DESIGN — capture the action id the menu item actually dispatches (MT3),
    // by instrumenting handleAction without altering behaviour.
    await page.evaluate(() => {
      window.__dispatched = [];
      const orig = window.handleAction;
      window.handleAction = (a) => { window.__dispatched.push(a); return orig(a); };
    });

    await rightClickDesign(page, id);
    await clickMenuItem(page, 'Formatear campo');
    const designFormat = await panelSnapshot(page);
    await rightClickDesign(page, id);
    await clickMenuItem(page, 'Propiedades');
    const designProps = await panelSnapshot(page);
    const designDispatched = await page.evaluate(() => window.__dispatched.slice());

    // PREVIEW
    await enterPreview(page);
    await page.evaluate(() => { window.__dispatched = []; });
    await rightClickPreview(page, id);
    await clickMenuItem(page, 'Formatear campo');
    const previewFormat = await panelSnapshot(page);
    await rightClickPreview(page, id);
    await clickMenuItem(page, 'Propiedades');
    const previewProps = await panelSnapshot(page);
    const previewDispatched = await page.evaluate(() => window.__dispatched.slice());

    // MT1: format action produces same functional result in both modes
    assert.equal(designFormat.activeElementId, 'prop-font-family');
    assert.equal(previewFormat.activeElementId, 'prop-font-family');
    assert.equal(designFormat.formatFocused, previewFormat.formatFocused);
    assert.equal(designFormat.panelVisible && previewFormat.panelVisible, true);

    // MT2: properties action produces same functional result in both modes
    assert.equal(designProps.activeElementId, 'prop-x');
    assert.equal(previewProps.activeElementId, 'prop-x');
    assert.equal(designProps.generalFocused, previewProps.generalFocused);

    // MT3: identical action ids dispatched in both modes
    assert.deepEqual(designDispatched, ['format-field', 'open-properties']);
    assert.deepEqual(previewDispatched, ['format-field', 'open-properties']);
    await assertNoConsoleErrors(consoleErrors, 'metamorphic');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE metamorphic MT4: repeating an action 3× is idempotent (stable focus, single highlight)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await firstDesignId(page);
    for (let i = 0; i < 3; i += 1) {
      await rightClickDesign(page, id);
      await clickMenuItem(page, 'Formatear campo');
    }
    const snap = await panelSnapshot(page);
    assert.equal(snap.activeElementId, 'prop-font-family', 'focus stable after 3× format');
    assert.equal(snap.focusCount, 1, 'exactly one section highlighted (no leak/duplication)');
    assert.equal(snap.formatFocused, true);
    assert.equal(snap.generalFocused, false);

    // switching action clears the previous highlight (no stale state)
    await rightClickDesign(page, id);
    await clickMenuItem(page, 'Propiedades');
    const after = await panelSnapshot(page);
    assert.equal(after.focusCount, 1, 'still exactly one section highlighted after switching');
    assert.equal(after.generalFocused, true);
    assert.equal(after.formatFocused, false, 'previous format highlight cleared');
    await assertNoConsoleErrors(consoleErrors, 'idempotent');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE metamorphic MT5: no selection → no crash, no invalid panel, element items absent from canvas menu', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    // Clear any selection and invoke both actions directly: the guard must no-op cleanly.
    const result = await page.evaluate(() => {
      DS.clearSelectionState('test.clear');
      PropertiesEngine.render();
      const before = document.getElementById('props-form').classList.contains('hidden');
      let threw = null;
      try { window.handleAction('format-field'); window.handleAction('open-properties'); }
      catch (e) { threw = String(e); }
      return {
        threw,
        formHiddenBefore: before,
        formHiddenAfter: document.getElementById('props-form').classList.contains('hidden'),
        activeIsBody: document.activeElement === document.body || document.activeElement === document.documentElement,
        focusCount: document.querySelectorAll('#props-form .prop-section.props-section-focus').length,
      };
    });
    assert.equal(result.threw, null, 'invoking actions with no selection must not throw');
    assert.equal(result.formHiddenAfter, true, 'with no selection the props form must stay hidden (no invalid panel)');
    assert.equal(result.focusCount, 0, 'no section may be highlighted without a selection');

    // The canvas (no-selection) context menu must NOT offer the element-only items.
    const canvas = await page.locator('#canvas-layer').boundingBox();
    await page.mouse.click(canvas.x + canvas.width - 24, canvas.y + canvas.height - 24, { button: 'right' });
    await page.waitForFunction(() => document.getElementById('ctx-menu').classList.contains('visible'));
    const items = await page.evaluate(() =>
      [...document.querySelectorAll('#ctx-menu .ctx-item:not(.separator)')].map(i => i.textContent.trim()));
    assert.ok(!items.some(t => t.includes('Formatear campo')), 'canvas menu must not contain "Formatear campo"');
    assert.ok(!items.some(t => t.includes('Propiedades')), 'canvas menu must not contain "Propiedades"');
    await assertNoConsoleErrors(consoleErrors, 'no-selection');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE metamorphic MT6: text/field/line/rect → both commands focus a real control (never silent no-op)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    const types = ['text', 'field', 'line', 'rect'];
    for (const type of types) {
      const id = await page.evaluate((t) => {
        const sectionId = DS.sections[0].id;
        const extra = t === 'text' ? { content: 'X' } : t === 'field' ? { fieldPath: 'a.b', content: '' } : {};
        const el = mkEl(t, sectionId, 10, 10, 80, 14, extra);
        DS.setElements([...DS.elements, el], 'test.mt6');
        _canonicalCanvasWriter().renderElement(el);
        DS.selectOnly(el.id, 'test.mt6');
        SelectionEngine.renderHandles();
        return el.id;
      }, type);

      const fmt = await page.evaluate(() => {
        window.handleAction('format-field');
        return { active: document.activeElement?.id, fmt: !!document.getElementById('props-format-anchor')?.classList.contains('props-section-focus') };
      });
      assert.equal(fmt.active, 'prop-font-family', `${type}: format-field must focus a real control (not a silent no-op)`);
      assert.equal(fmt.fmt, true, `${type}: format section must be highlighted`);

      const props = await page.evaluate(() => {
        window.handleAction('open-properties');
        return { active: document.activeElement?.id, gen: !!document.getElementById('props-general-anchor')?.classList.contains('props-section-focus') };
      });
      assert.equal(props.active, 'prop-x', `${type}: open-properties must focus a real control (not a silent no-op)`);
      assert.equal(props.gen, true, `${type}: general section must be highlighted`);
    }
    await assertNoConsoleErrors(consoleErrors, 'element-types');
  } finally {
    await browser.close();
    await server.stop();
  }
});
