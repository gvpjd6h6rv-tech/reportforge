/**
 * Guardrail for commit 1ae0aec (fix(debug-panels): make BUILD INFO / ZOOM
 * DEBUG draggable+collapsible, no longer overlap #workspace).
 *
 * rf_debug_center_overlay_layout.test.mjs already guards the two debug
 * panels (#rf-build-debug, #rf-zoom-live-debug) not overlapping EACH OTHER,
 * but nothing guarded the three actual behaviors 1ae0aec introduced:
 *   1. Both panels default to collapsed (header-only footprint).
 *   2. At a narrow viewport — the scenario in the commit message — neither
 *      panel overlaps #workspace.
 *   3. Both panels are draggable from their header (pointerdown/move/up on
 *      the handle moves the panel and persists a "_userMoved" position in
 *      localStorage), and the collapse button toggles data-collapsed.
 *
 * Without this, a future change could silently re-anchor these panels back
 * on top of #workspace, or break drag/collapse wiring, and nothing in the
 * suite would catch it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

function overlaps(a, b) {
  if (!a || !b) return false;
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

test('LIVE: BUILD INFO / ZOOM DEBUG panels default collapsed, never overlap #workspace, and support drag + collapse', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    // Narrow viewport — the exact scenario from the 1ae0aec commit message
    // where the panels used to visually collide with #workspace.
    await page.setViewportSize({ width: 900, height: 420 });
    await page.waitForTimeout(300);

    const initial = await page.evaluate(() => {
      const build = document.getElementById('rf-build-debug');
      const zoom = document.getElementById('rf-zoom-live-debug');
      const ws = document.getElementById('workspace');
      return {
        buildCollapsed: build?.dataset.collapsed,
        zoomCollapsed: zoom?.dataset.collapsed,
        buildRect: build?.getBoundingClientRect(),
        zoomRect: zoom?.getBoundingClientRect(),
        wsRect: ws?.getBoundingClientRect(),
      };
    });

    assert.equal(initial.buildCollapsed, 'true', 'BUILD INFO panel must default to collapsed');
    assert.equal(initial.zoomCollapsed, 'true', 'ZOOM DEBUG panel must default to collapsed');
    assert.ok(initial.wsRect, '#workspace must be present');
    assert.equal(overlaps(initial.buildRect, initial.wsRect), false,
      'BUILD INFO panel must not overlap #workspace at a narrow viewport');
    assert.equal(overlaps(initial.zoomRect, initial.wsRect), false,
      'ZOOM DEBUG panel must not overlap #workspace at a narrow viewport');

    // Collapse toggle: expand BUILD INFO, body becomes visible, then re-collapse.
    const collapseToggle = await page.evaluate(() => {
      const build = document.getElementById('rf-build-debug');
      const btn = document.getElementById('rf-build-debug-collapse');
      btn.click();
      const expandedState = build.dataset.collapsed;
      const bodyVisibleExpanded = getComputedStyle(build.querySelector('.rf-debug-panel__body')).display !== 'none';
      btn.click();
      const collapsedState = build.dataset.collapsed;
      const bodyVisibleCollapsed = getComputedStyle(build.querySelector('.rf-debug-panel__body')).display !== 'none';
      return { expandedState, bodyVisibleExpanded, collapsedState, bodyVisibleCollapsed };
    });
    assert.equal(collapseToggle.expandedState, 'false', 'collapse button must expand the panel');
    assert.equal(collapseToggle.bodyVisibleExpanded, true, 'expanded panel body must be visible');
    assert.equal(collapseToggle.collapsedState, 'true', 'collapse button must re-collapse the panel');
    assert.equal(collapseToggle.bodyVisibleCollapsed, false, 'collapsed panel body must be hidden');

    // Drag: pointerdown+move+up on the BUILD INFO header must move the panel
    // and persist a real user-moved marker (not just the resize-clamp marker).
    const dragResult = await page.evaluate(() => {
      const head = document.getElementById('rf-build-debug-head');
      const build = document.getElementById('rf-build-debug');
      const before = build.getBoundingClientRect();
      const startX = before.left + 10, startY = before.top + 5;
      head.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, button: 0, bubbles: true, pointerId: 1 }));
      head.dispatchEvent(new PointerEvent('pointermove', { clientX: startX - 120, clientY: startY + 60, bubbles: true, pointerId: 1 }));
      head.dispatchEvent(new PointerEvent('pointerup', { clientX: startX - 120, clientY: startY + 60, bubbles: true, pointerId: 1 }));
      const after = build.getBoundingClientRect();
      return {
        before: { left: before.left, top: before.top },
        after: { left: after.left, top: after.top },
        userMovedMarker: localStorage.getItem('RF_BUILD_DEBUG_POS_userMoved'),
        storedPos: localStorage.getItem('RF_BUILD_DEBUG_POS'),
      };
    });
    assert.notEqual(dragResult.before.left, dragResult.after.left, 'dragging the header must move the panel horizontally');
    assert.notEqual(dragResult.before.top, dragResult.after.top, 'dragging the header must move the panel vertically');
    assert.notEqual(dragResult.userMovedMarker, null, 'a real pointer drag must set the _userMoved marker');
    assert.notEqual(dragResult.storedPos, null, 'drag must persist the new position to localStorage');

    await assertNoConsoleErrors(consoleErrors, 'debug panel drag/collapse/no-workspace-overlap');
  } finally {
    await browser.close();
    await server.stop();
  }
});
