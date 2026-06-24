/**
 * RF-DESIGN-KEYBOARD-FLICKER-1 — regression test for the confirmed root
 * cause (live-verified in both headed Chrome and headed Firefox, see
 * reportforge/tests/design_keyboard_flicker_iteration2.mjs for the
 * diagnostic instrument and conversation history for the visual
 * confirmation): with Preview open, KeyboardEngine's arrow-key nudge
 * called DS.saveHistory() on EVERY keydown. engines/CommandRuntimeInit.js
 * patches DS.saveHistory so that, while DS.previewMode is true, each call
 * also triggers PreviewEngineRenderer.refresh() — which synchronously
 * blanks #preview-content (the whole A4 page), shows a loading
 * placeholder, awaits a fetch round-trip, then blanks and rebuilds again.
 * A held arrow key (autorepeat) fired this on every keydown, producing
 * the reported full-page flicker. Mouse drag never did this because it
 * only calls saveHistory() once, on mouseup.
 *
 * Fix: KeyboardEngine.js coalesces the nudge's saveHistory() call to fire
 * once per gesture, flushed deterministically on the arrow key's keyup
 * (mirroring mouse drag's mousedown→...→mouseup — not a debounce timer;
 * see design_keyboard_nudge_preview_hold_single_commit.test.mjs for why a
 * timer-only approach double-fires against real OS key-repeat timing), or
 * immediately if any other shortcut/undo/redo runs mid-hold, or on window
 * blur. These tests must simulate a REAL held key (one keydown, repeats
 * with no keyup in between, one keyup at release) via CDP — Playwright's
 * page.keyboard.press() sends a keydown+keyup pair for every call, which
 * is N separate one-tap gestures, not one held gesture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  selectPreviewSingle,
  enterPreview,
  setZoom,
} from './runtime_harness.mjs';

async function instrumentPreviewRefresh(page) {
  await page.evaluate(() => {
    window.__rfPreviewRefresh = { calls: 0, blankEvents: 0 };
    const orig = window.PreviewEngineV19.refresh;
    window.PreviewEngineV19.refresh = function (...args) {
      window.__rfPreviewRefresh.calls += 1;
      return orig.apply(this, args);
    };
    const content = document.getElementById('preview-content');
    const obs = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'childList' && m.removedNodes.length > 0) window.__rfPreviewRefresh.blankEvents += 1;
      });
    });
    obs.observe(content, { childList: true });
    window.__rfPreviewRefreshObs = obs;
  });
}

// A real held key: one keydown, then repeat keydowns with NO keyup between
// them (e.repeat=true, like real OS autorepeat), and exactly one keyup at
// the end (unless release=false, for tests that need to check behavior
// while the key is still conceptually held down).
async function holdArrowRight(page, { count = 20, gapMs = 35, release = true } = {}) {
  const client = await page.context().newCDPSession(page);
  const keyEvent = (type, extra = {}) => client.send('Input.dispatchKeyEvent', {
    type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39, ...extra,
  });
  await keyEvent('rawKeyDown');
  for (let i = 1; i < count; i++) {
    await page.waitForTimeout(gapMs);
    await keyEvent('rawKeyDown', { autoRepeat: true });
  }
  if (release) await keyEvent('keyUp');
  return client;
}

test('LIVE: held arrow-key nudge in Preview triggers Preview refresh at most once, not once per keydown', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await enterPreview(page);
    await selectPreviewSingle(page, 0);
    await instrumentPreviewRefresh(page);

    await holdArrowRight(page, { count: 20 });
    await page.waitForTimeout(300); // let the keyup-triggered commit settle

    const result = await page.evaluate(() => ({ ...window.__rfPreviewRefresh }));
    assert.ok(
      result.calls <= 1,
      `expected at most 1 PreviewEngineRenderer.refresh() call for one held-key gesture (20 keydowns), got ${result.calls} — this is the reported full-page Preview flicker`,
    );
    assert.ok(
      result.blankEvents <= 2,
      `expected at most 2 #preview-content childList removals (one refresh cycle: show-loading + rebuild), got ${result.blankEvents}`,
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: held arrow-key nudge produces exactly one history entry (parity with mouse-drag commit granularity)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await page.evaluate((id) => { const e = DS.getElementById(id); return { x: e.x, y: e.y }; }, id);
    const historyLenBefore = await page.evaluate(() => DS.history.length);

    await holdArrowRight(page, { count: 20 });
    await page.waitForTimeout(300); // let the keyup-triggered commit settle

    const historyLenAfter = await page.evaluate(() => DS.history.length);
    assert.equal(
      historyLenAfter - historyLenBefore,
      1,
      `expected exactly 1 new history entry for one held-key nudge gesture (20 keydowns), got ${historyLenAfter - historyLenBefore} — keyboard nudge must match mouse-drag's one-commit-per-gesture granularity`,
    );

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const afterUndo = await page.evaluate((id) => { const e = DS.getElementById(id); return { x: e.x, y: e.y }; }, id);
    assert.deepEqual(afterUndo, before, 'a single Ctrl+Z must undo the WHOLE nudge gesture (all 20 keydowns), not just its last step');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Ctrl+Z while the arrow key is still physically held down flushes the pending commit first, then undoes it', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await page.evaluate((id) => { const e = DS.getElementById(id); return { x: e.x, y: e.y }; }, id);

    // Don't release the arrow key (release: false) — Ctrl+Z fires while the
    // gesture is still conceptually mid-hold, with no keyup ever having
    // flushed the pending commit yet. _onKeyDown must flush it before
    // running undo (any non-nudge shortcut does this), so the gesture is
    // never silently lost.
    const client = await holdArrowRight(page, { count: 5, release: false });
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const afterUndo = await page.evaluate((id) => { const e = DS.getElementById(id); return { x: e.x, y: e.y }; }, id);
    assert.deepEqual(afterUndo, before, 'Ctrl+Z mid-hold must flush the pending commit first, then undo it — no lost or stale history');

    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
  } finally {
    await browser.close();
    await server.stop();
  }
});
