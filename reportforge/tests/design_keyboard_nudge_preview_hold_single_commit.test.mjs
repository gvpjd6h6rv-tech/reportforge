/**
 * RF-DESIGN-KEYBOARD-FLICKER-1 — regression test for the double-flicker
 * bug in the first debounce-only fix: a real held key has an OS-level
 * "initial repeat delay" before autorepeat kicks in (commonly 500-650ms),
 * which is LONGER than the 250ms idle-debounce that fix used as its ONLY
 * "gesture ended" signal. So in a real browser, the debounce timer fired
 * on its own right after the very FIRST keydown (nothing else arrived
 * within 250ms yet) — committing/refreshing once near the start of the
 * hold — and then again at release: two flickers per gesture instead of
 * one. Confirmed live by the user; a synthetic test that fires repeat
 * keydowns every ~35ms from t=0 (no initial-delay gap) never reproduces
 * this, which is exactly why it slipped through
 * design_keyboard_nudge_preview_refresh_coalescing.test.mjs.
 *
 * Fix: the arrow key's keyup is now the deterministic "gesture ended"
 * signal (mirroring mouse drag's mouseup), not a guess about
 * inter-keydown timing. This test reproduces the real OS timing
 * (long initial delay, then fast repeats) and asserts exactly one commit
 * for the whole gesture, regardless of how long the initial delay is.
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
    window.__rfPreviewRefresh = { calls: 0, times: [] };
    const orig = window.PreviewEngineV19.refresh;
    window.PreviewEngineV19.refresh = function (...args) {
      window.__rfPreviewRefresh.calls += 1;
      window.__rfPreviewRefresh.times.push(performance.now());
      return orig.apply(this, args);
    };
  });
}

test('LIVE: a real held key (long OS initial-repeat-delay, then fast repeats) still produces exactly one Preview refresh for the whole gesture', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await enterPreview(page);
    await selectPreviewSingle(page, 0);
    await instrumentPreviewRefresh(page);

    const client = await page.context().newCDPSession(page);
    // First keydown (e.repeat=false), then emulate a real OS's initial
    // repeat delay (~600ms — longer than the old 250ms debounce) before
    // autorepeat actually kicks in, then fast repeats (~35ms apart).
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await page.waitForTimeout(600);
    for (let i = 0; i < 10; i++) {
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39, autoRepeat: true });
      await page.waitForTimeout(35);
    }

    // Still mid-hold (no keyup yet) — must be zero commits so far, even
    // though more than 250ms has elapsed since the first keydown.
    const duringHold = await page.evaluate(() => window.__rfPreviewRefresh.calls);
    assert.equal(duringHold, 0, `expected 0 Preview refreshes while the key is still held down (even after >250ms), got ${duringHold} — this is the reported "flicker at the start of the hold"`);

    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => ({ ...window.__rfPreviewRefresh }));
    assert.equal(result.calls, 1, `expected exactly 1 Preview refresh for the whole gesture (committed on keyup, like mouse's mouseup), got ${result.calls}`);
  } finally {
    await browser.close();
    await server.stop();
  }
});
