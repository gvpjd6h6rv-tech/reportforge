/**
 * RF-DESIGN-KEYBOARD-FLICKER-1 — regression test for the freeze+jump
 * regression introduced by the first debounce-only fix attempt (see
 * design_keyboard_nudge_preview_refresh_coalescing.test.mjs for the
 * flicker fix itself).
 *
 * Coalescing the nudge's DS.saveHistory() (and the full Preview refresh
 * it triggers via CommandRuntimeInit's patch) to once per gesture fixed
 * the flicker, but left the Preview pane with NOTHING updating it during
 * the held key — it sat frozen at the pre-gesture position for the whole
 * hold, then snapped straight to the final position once the debounced
 * commit fired. Confirmed live: pressing/holding an arrow key, the
 * element appears stuck, then jumps abruptly by the full gesture distance.
 *
 * Mouse drag never has this problem because SelectionInteractionMotion's
 * _doMove restyles the live Preview nodes (.pv-el + preview-render-layer)
 * on every mousemove via SelectionDragPreviewSync, decoupled from the
 * once-per-gesture DS.saveHistory()/full-refresh commit on mouseup.
 * KeyboardEngine's nudge must do the same: move the Preview nodes live on
 * every keydown, while keeping the history/full-refresh commit coalesced
 * (flushed deterministically on the arrow key's keyup, not a debounce
 * timer — see design_keyboard_nudge_preview_hold_single_commit.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectPreviewSingle,
  enterPreview,
} from './runtime_harness.mjs';

async function instrumentPreviewRefresh(page) {
  await page.evaluate(() => {
    window.__rfPreviewRefresh = { calls: 0 };
    const orig = window.PreviewEngineV19.refresh;
    window.PreviewEngineV19.refresh = function (...args) {
      window.__rfPreviewRefresh.calls += 1;
      return orig.apply(this, args);
    };
  });
}

test('LIVE: keyboard nudge moves the Preview pane live on every keydown — no freeze, no end-of-gesture jump', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await enterPreview(page);
    await selectPreviewSingle(page, 0);
    await instrumentPreviewRefresh(page);

    const id = await page.evaluate(() => [...DS.selection][0]);
    const startX = await page.evaluate((id) => DS.getElementById(id).x, id);

    // A real held key: one keydown, then repeat keydowns with NO keyup in
    // between (e.repeat=true) — Playwright's page.keyboard.press() sends a
    // full keydown+keyup pair per call, which is 8 separate one-tap
    // gestures, not one held gesture (that's a different, already-covered
    // case — single taps are each their own commit, by design).
    const client = await page.context().newCDPSession(page);
    const keyEvent = (type, extra = {}) => client.send('Input.dispatchKeyEvent', {
      type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39, ...extra,
    });

    const seenLefts = [];
    for (let i = 0; i < 8; i++) {
      await keyEvent('rawKeyDown', i === 0 ? {} : { autoRepeat: true });
      // Read immediately — no waiting for anything to settle — to prove
      // the Preview node tracks every single keydown, not just the final
      // settled position.
      const left = await page.evaluate(
        (id) => parseFloat(document.querySelector(`.pv-el[data-origin-id="${id}"]`).style.left),
        id,
      );
      seenLefts.push(left);
    }

    const expected = Array.from({ length: 8 }, (_, i) => startX + i + 1);
    assert.deepEqual(
      seenLefts,
      expected,
      `Preview .pv-el must move by 1px on every single keydown (live tracking, like mouse drag) — got ${JSON.stringify(seenLefts)}, expected ${JSON.stringify(expected)}. A frozen run followed by a late jump (e.g. all early reads stuck at ${startX}) is the reported regression.`,
    );

    // The full canonical refresh must still only fire once the gesture
    // settles — the live Preview-node restyle above must NOT regress the
    // flicker fix from design_keyboard_nudge_preview_refresh_coalescing.
    const callsDuringHold = await page.evaluate(() => window.__rfPreviewRefresh.calls);
    assert.equal(callsDuringHold, 0, 'no full Preview refresh should fire mid-gesture — only the live node restyle should run on each keydown');

    await keyEvent('keyUp');
    await page.waitForTimeout(300);
    const callsAfterSettle = await page.evaluate(() => window.__rfPreviewRefresh.calls);
    assert.equal(callsAfterSettle, 1, 'exactly one full Preview refresh once the keyup-triggered commit fires after the gesture ends');
  } finally {
    await browser.close();
    await server.stop();
  }
});
