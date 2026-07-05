// RF-SECTION-MOVE-INK-1 — USER PARITY guard.
//
// Contract:
//   Given a field/text element with known visible (sentinel) text,
//   When it is moved from any section to any other section (via the
//   Properties panel "Sección:" dropdown -- the real UI path),
//   Then the field box AND the field's own text must remain visibly
//   PAINTED inside the target section's bbox.
//
// DOM existence, a non-degenerate bounding box, and a visible selection
// box are explicitly NOT sufficient here -- see the incident this guards
// against: .cr-section declares `overflow: visible` in
// designer/styles/canvas.css, but ALSO `contain: layout paint`, which
// silently clips a child's PAINT the moment it lands outside the
// section's own box, even though every DOM-level signal (display,
// visibility, opacity, getBoundingClientRect) keeps reporting "fine".
// The existing user_parity `clippingSignal` (helpers.mjs) only inspects
// ancestor `overflow`, never `contain` -- confirmed it would NOT catch
// this bug -- so this guard samples real screenshot pixels instead.
//
// Root cause fixed: engines/DocumentActions.js::updateElementLayout now
// clamps x/y into the target section's own bounds whenever sectionId
// changes; engines/PropertiesEngine.js's "Sección:" dropdown now routes
// through that canonical path instead of mutating el.sectionId directly;
// engines/CanvasLayoutElements.js's updateElement/updateElementPosition
// now detect and repair a stale (wrong-section) DOM parent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  clearSelectionByCanvasClick,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';

const SENTINEL = 'INK106';
const INK_THRESHOLD = 5;

// The 5 origin->destination transitions explicitly required for this guard.
const TRANSITIONS = [
  ['s-rh', 's-ph'],
  ['s-ph', 's-d1'],
  ['s-d1', 's-pf'],
  ['s-pf', 's-rf'],
  ['s-rf', 's-rh'],
];

async function measureInkAtRect(page, rect, margin = 3) {
  const shotB64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ b64, rect, margin }) => {
    const img = new Image();
    const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    img.src = 'data:image/png;base64,' + b64;
    await loaded;
    const dpr = window.devicePixelRatio || 1;
    const left = Math.max(0, Math.round(rect.x + margin) * dpr);
    const top = Math.max(0, Math.round(rect.y + margin) * dpr);
    const width = Math.max(1, Math.round(rect.width - margin * 2) * dpr);
    const height = Math.max(1, Math.round(rect.height - margin * 2) * dpr);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    // Robust background estimate: MODE of quantized colors, not a single
    // corner pixel -- a corner can land on an antialiased border edge and
    // poison the comparison (confirmed during this bug's own investigation:
    // a corner-pixel version of this same check flagged 98.7% of a crop as
    // "ink", which is not physically plausible for a 6-character label).
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let modeKey = null, modeCount = -1;
    for (const [k, c] of counts) { if (c > modeCount) { modeKey = k; modeCount = c; } }
    const [bgR, bgG, bgB] = modeKey.split(',').map((n) => Number(n) << 3);
    let inkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const dr = Math.abs(data[i] - bgR), dg = Math.abs(data[i + 1] - bgG), db = Math.abs(data[i + 2] - bgB);
      if (dr + dg + db > 60) inkPixels++;
    }
    return { inkPixels, totalPixels: width * height, bg: [bgR, bgG, bgB] };
  }, { b64: shotB64, rect, margin });
}

test('USER-PARITY section move keeps field ink visible across all required transitions', { timeout: 180000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    const results = [];

    for (const [originSectionId, targetSectionId] of TRANSITIONS) {
      // Place a real, client-data-bound field (cliente.email if present,
      // else any field/text element) into the ORIGIN section with a y deep
      // enough to overflow whatever section it lands in next, and give it
      // the sentinel content -- the exact regression scenario (fieldPath
      // cliente.email, sentinel INK106) confirmed live during this bug's
      // investigation.
      const before = await page.evaluate(({ sentinel, originSectionId, targetSectionId }) => {
        const el = DS.elements.find((e) => e.fieldPath === 'cliente.email')
          || DS.elements.find((e) => e.type === 'field')
          || DS.elements.find((e) => e.type === 'text');
        const os = DS.getSection(originSectionId);
        const ts = DS.getSection(targetSectionId);
        // Deep enough to overflow the (shorter) target on an un-clamped move,
        // but capped modestly so it stays on-screen for the origin ink probe.
        const y = Math.max(0, Math.min((os?.height || 20) - el.h - 1, (ts?.height || 20) + 6));
        DS.updateElementLayout(el.id, { sectionId: originSectionId, y }, 'test-setup');
        el.content = sentinel;
        _canonicalCanvasWriter().updateElement(el.id);
        return { id: el.id, sectionId: el.sectionId, x: el.x, y: el.y, w: el.w, h: el.h, fieldPath: el.fieldPath };
      }, { sentinel: SENTINEL, originSectionId, targetSectionId });

      // Confirm ink visible in the ORIGIN section (scrolled into view) before
      // touching anything -- a precheck the placement above keeps on-screen.
      await clearSelectionByCanvasClick(page);
      const originRect = await page.evaluate((id) => {
        const div = document.querySelector(`.cr-element[data-id="${id}"]`);
        div.scrollIntoView({ block: 'center' });
        const r = div.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, before.id);
      await page.waitForTimeout(80);
      const originInk = await measureInkAtRect(page, originRect);
      assert.ok(
        originInk.inkPixels > INK_THRESHOLD,
        `${originSectionId}->${targetSectionId}: sentinel must be visible in ORIGIN section before the move (inkPixels=${originInk.inkPixels})`,
      );

      // Open the Properties panel reliably via programmatic selection, THEN
      // drive the REAL UI gesture: a genuine <select> change on "Sección:".
      // (A geometric click on a scrolled element is flaky; the gesture under
      // test is the dropdown change, not how the panel got opened.)
      // PropertiesEngine._selectRow attaches its change listener via
      // setTimeout(...,0), so wait for that to flush before firing.
      await page.evaluate((id) => { DS.selectOnly(id, 'test'); if (typeof PropertiesEngine !== 'undefined' && PropertiesEngine.render) PropertiesEngine.render(); }, before.id);
      await page.waitForSelector('#prop-section', { timeout: 5000 });
      await page.waitForTimeout(30);
      await page.selectOption('#prop-section', targetSectionId);
      await page.waitForFunction(
        ({ id, targetSectionId }) => DS.getElementById(id)?.sectionId === targetSectionId,
        { id: before.id, targetSectionId },
        { timeout: 5000 },
      );

      const after = await page.evaluate((id) => {
        const el = DS.getElementById(id);
        return { sectionId: el.sectionId, x: el.x, y: el.y, w: el.w, h: el.h };
      }, before.id);
      assert.equal(after.sectionId, targetSectionId, `${originSectionId}->${targetSectionId}: sectionId must update to the destination`);

      const domState = await page.evaluate(({ id, targetSectionId }) => {
        const div = document.querySelector(`.cr-element[data-id="${id}"]`);
        if (!div) return { found: false };
        div.scrollIntoView({ block: 'center' });
        const parentSection = div.closest('.cr-section');
        const rect = div.getBoundingClientRect();
        return {
          found: true,
          parentSectionId: parentSection ? parentSection.dataset.sectionId : null,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }, { id: before.id, targetSectionId });
      await page.waitForTimeout(80);
      assert.ok(domState.found, `${originSectionId}->${targetSectionId}: element div must still exist after the move`);
      assert.equal(domState.parentSectionId, targetSectionId, `${originSectionId}->${targetSectionId}: DOM must be re-parented into the destination section (no stale DOM)`);

      const noDupes = await page.evaluate((id) => document.querySelectorAll(`.cr-element[data-id="${id}"]`).length, before.id);
      assert.equal(noDupes, 1, `${originSectionId}->${targetSectionId}: exactly one DOM node must exist for this element (no duplicate)`);

      // Deselect BEFORE the ink screenshot: the blue selection overlay
      // paints over the same rect and would contaminate real content ink
      // with border/overlay pixels -- precisely the false pass this guard
      // must exclude.
      await clearSelectionByCanvasClick(page);
      await page.waitForTimeout(150);

      const afterInk = await measureInkAtRect(page, domState.rect);
      results.push({ transition: `${originSectionId}->${targetSectionId}`, inkPixels: afterInk.inkPixels });
      assert.ok(
        afterInk.inkPixels > INK_THRESHOLD,
        `${originSectionId}->${targetSectionId}: field text must remain visibly PAINTED inside the destination section ` +
        `(inkPixels=${afterInk.inkPixels}, threshold=${INK_THRESHOLD}) -- DOM/box-alone is not sufficient evidence`,
      );

      // fieldPath/type/content must survive the move untouched.
      const preserved = await page.evaluate((id) => {
        const el = DS.getElementById(id);
        return { fieldPath: el.fieldPath, type: el.type, content: el.content };
      }, before.id);
      assert.equal(preserved.fieldPath, before.fieldPath, `${originSectionId}->${targetSectionId}: fieldPath must survive the move`);
      assert.equal(preserved.content, SENTINEL, `${originSectionId}->${targetSectionId}: content must survive the move`);
    }

    console.log('SECTION MOVE INK SUMMARY:', JSON.stringify(results));
    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY section move visible ink');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('USER-PARITY section move clamps y instead of leaving stale out-of-bounds coordinates', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // Negative path: y far deeper than the shortest section's height.
    const result = await page.evaluate(() => {
      const el = DS.elements.find((e) => e.type === 'field') || DS.elements.find((e) => e.type === 'text');
      const originSection = DS.sections.find((s) => s.id !== 's-d1') || DS.sections[0];
      DS.updateElementLayout(el.id, { sectionId: originSection.id, y: 5000 }, 'test-setup');
      const targetSection = DS.getSection('s-d1');
      DS.updateElementLayout(el.id, { sectionId: 's-d1' }, 'test-clamp');
      const after = DS.getElementById(el.id);
      return { y: after.y, h: after.h, targetHeight: targetSection.height, sectionId: after.sectionId };
    });
    assert.equal(result.sectionId, 's-d1');
    assert.ok(result.y >= 0, `y must never go negative, got ${result.y}`);
    assert.ok(
      result.y <= Math.max(0, result.targetHeight - result.h),
      `y=${result.y} must be clamped within [0, targetSection.height(${result.targetHeight}) - h(${result.h})]`,
    );

    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY section move clamp');
  } finally {
    await browser.close();
    await server.stop();
  }
});
