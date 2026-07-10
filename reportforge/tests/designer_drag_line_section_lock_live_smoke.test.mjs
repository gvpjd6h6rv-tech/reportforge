/**
 * DESIGNER-DRAG-LINE-SECTION-LOCK-01
 *
 * Reported bug: a vertical line taller than its own section (its bottom
 * edge visually touches/enters the NEXT section) got reparented to that
 * next section on a purely HORIZONTAL drag, even with deltaY===0.
 *
 * Root cause (two independent layers, both patched):
 *  1. engines/DocumentActionsLayoutClamp.js::normalizeElementLayout — the
 *     overflow/carry re-owner ran whenever patch had a `y` key, regardless
 *     of whether y actually changed. An element taller than its own
 *     section always overflows the band check, so it re-owned on every
 *     move, including pure-x ones.
 *  2. engines/SelectionInteractionMotion.js::_doMove — the drag-move
 *     caller always sent {x, y} on every mouse-move tick, even when the
 *     snapped y was identical to the element's current y.
 *
 * Contract: horizontal drag changes only x. sectionId, y, and the DOM
 * owner section must stay unchanged, even though the line's bottom edge
 * keeps touching/overlapping the next section (the overlap itself is
 * never hidden or shortened away — only the reparent is fixed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'designer_drag_line_section_lock_two_section_vline.json');

// ── Static source guard: _doMove must not unconditionally send y ──────
test('DRAG-LOCK-01: _doMove omits y from the move patch when the snapped y is unchanged', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'engines/SelectionInteractionMotion.js'), 'utf8');
  const match = src.match(/function _doMove\b[\s\S]*?^  \}/m);
  assert.ok(match, '_doMove not found in SelectionInteractionMotion.js');
  const body = match[0];
  assert.ok(
    /const movePatch = \{ x: newX \};\s*\n\s*if \(newY !== SelectionState\.snap\(orig\.y\)\) movePatch\.y = newY;/.test(body),
    '_doMove must build movePatch with x always, and y only when newY differs from the SNAPPED orig.y',
  );
  assert.ok(
    !/engine\.updateElementLayout\(el\.id,\s*\{\s*\n?\s*x:\s*newX,\s*\n?\s*y:\s*newY,/.test(body),
    '_doMove must not send an unconditional {x, y} patch on every move tick',
  );
});

async function openFixture(page) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('button[data-action="open"]').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(FIXTURE_PATH);
  await page.waitForTimeout(1200);
}

async function dragLineHorizontally(page) {
  // Start within section A's own unclipped bounds (local y=10 of a 30px
  // section) -- the section's own overflow clipping makes the part of the
  // line past its own section boundary non-hittable, so a click at the
  // line's vertical CENTER (which sits past the boundary for h=60 in a
  // 30px section) would land on the section container, not the element.
  const lineRect = await page.evaluate(() => document.querySelector('.cr-element[data-id="vline1"]').getBoundingClientRect().toJSON());
  const startX = lineRect.left + lineRect.width / 2;
  const startY = lineRect.top + 10;
  const endX = startX + 100;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY, { steps: 5 });
  await page.mouse.move(endX, startY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test('DRAG-LOCK-01 live smoke: horizontal drag on an oversized vertical line preserves sectionId, y and DOM owner', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  let browser;
  try {
    const launched = await launchRuntimePage(server.baseUrl);
    browser = launched.browser;
    const { page } = launched;

    await openFixture(page);

    const before = await page.evaluate(() => ({ ...window.DS.getElementById('vline1') }));
    assert.equal(before.sectionId, 's-A', 'fixture sanity: line must start owned by s-A');
    assert.ok(before.y + before.h > 30, 'fixture sanity: line bottom must overflow section A (height 30)');

    await dragLineHorizontally(page);

    const after = await page.evaluate(() => ({ ...window.DS.getElementById('vline1') }));
    const domInfo = await page.evaluate(() => {
      const el = document.querySelector('.cr-element[data-id="vline1"]');
      const parentSection = el ? el.closest('.cr-section') : null;
      return { domSectionId: parentSection ? parentSection.dataset.sectionId : null, elFound: !!el };
    });

    assert.equal(after.sectionId, before.sectionId, 'sectionId must not change on a horizontal-only drag');
    assert.equal(after.y, before.y, 'y must not change on a horizontal-only drag');
    assert.notEqual(after.x, before.x, 'x must change to reflect the drag');
    assert.ok(Math.abs(after.y - before.y) <= 1, 'deltaY must be ~0');
    assert.ok(domInfo.elFound, 'element must still be present in the DOM');
    assert.equal(domInfo.domSectionId, 's-A', 'DOM owner section must remain s-A (not reparented into s-B)');
    // the line must still genuinely overflow into the next section -- the
    // fix must not be achieved by shortening the line or hiding the overlap
    assert.ok(after.y + after.h > 30, 'line must still visually overflow section A after the fix');
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
});
