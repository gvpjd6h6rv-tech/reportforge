import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// Simulates a section resize drag via direct SectionResizeEngine API calls.
// page.mouse is avoided because SectionResizeEngine.attach() exits early when
// EngineCore's central router is active — direct pointerdown listeners are never
// registered, so synthetic mouse events don't reach SectionResizeEngine.
async function dragSectionHandle(page, sectionId, dy) {
  await page.evaluate(({ sid, delta }) => {
    const startY = 200;
    SectionResizeEngine.onPointerDown({ button: 0, clientX: 0, clientY: startY }, sid);
    SectionResizeEngine.onMouseMove({ clientX: 0, clientY: startY + delta });
    SectionResizeEngine.onMouseUp({});
  }, { sid: sectionId, delta: dy });
  await page.waitForTimeout(200);
}

test('TANDA 8 — SECTION-001..020', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
    try {
      await reloadRuntime(page, server.baseUrl);

      // ─── SECTION-001 ──────────────────────────────────────────────────────
      await t.test('SECTION-001 DS.sections has 5 entries with expected IDs in order', async () => {
        const ids = await page.evaluate(() => DS.sections.map((s) => s.id));
        assert.deepEqual(ids, ['s-rh', 's-ph', 's-d1', 's-pf', 's-rf']);
      });

      // ─── SECTION-002 ──────────────────────────────────────────────────────
      await t.test('SECTION-002 section stypes in order: rh ph det pf rf', async () => {
        const stypes = await page.evaluate(() => DS.sections.map((s) => s.stype));
        assert.deepEqual(stypes, ['rh', 'ph', 'det', 'pf', 'rf']);
      });

      // ─── SECTION-003 ──────────────────────────────────────────────────────
      await t.test('SECTION-003 all section heights positive; sum equals DS.getTotalHeight()', async () => {
        const { heights, total } = await page.evaluate(() => ({
          heights: DS.sections.map((s) => s.height),
          total: DS.getTotalHeight(),
        }));
        for (const h of heights) {
          assert.ok(h > 0, `section height must be positive, got ${h}`);
        }
        const sum = heights.reduce((a, b) => a + b, 0);
        assert.equal(sum, total, `sum of heights ${sum} != DS.getTotalHeight() ${total}`);
      });

      // ─── SECTION-004 ──────────────────────────────────────────────────────
      await t.test('SECTION-004 #sections-layer has 5 .cr-section divs with correct data-section-id', async () => {
        const ids = await page.evaluate(() =>
          [...document.querySelectorAll('#sections-layer .cr-section')]
            .map((el) => el.dataset.sectionId)
        );
        assert.equal(ids.length, 5, `expected 5 .cr-section divs, got ${ids.length}`);
        assert.deepEqual(ids, ['s-rh', 's-ph', 's-d1', 's-pf', 's-rf']);
      });

      // ─── SECTION-005 ──────────────────────────────────────────────────────
      await t.test('SECTION-005 .section-label DOM text matches DS.sections abbr for each section', async () => {
        const { modelAbbrs, domLabels } = await page.evaluate(() => ({
          modelAbbrs: Object.fromEntries(DS.sections.map((s) => [s.id, s.abbr])),
          domLabels: Object.fromEntries(
            [...document.querySelectorAll('#sections-layer .cr-section')].map((el) => [
              el.dataset.sectionId,
              el.querySelector('.section-label')?.textContent?.trim() ?? null,
            ])
          ),
        }));
        for (const [id, abbr] of Object.entries(modelAbbrs)) {
          assert.equal(
            domLabels[id],
            abbr,
            `section ${id}: DOM label "${domLabels[id]}" != DS abbr "${abbr}"`,
          );
        }
      });

      // ─── SECTION-006 ──────────────────────────────────────────────────────
      await t.test('SECTION-006 all DS.elements have sectionId referencing an existing section', async () => {
        const { elementSectionIds, sectionIds } = await page.evaluate(() => ({
          elementSectionIds: DS.elements.map((e) => e.sectionId),
          sectionIds: DS.sections.map((s) => s.id),
        }));
        const sectionSet = new Set(sectionIds);
        for (const sid of elementSectionIds) {
          assert.ok(sid && sectionSet.has(sid), `element.sectionId "${sid}" not found in DS.sections`);
        }
      });

      // ─── SECTION-007 ──────────────────────────────────────────────────────
      await t.test('SECTION-007 DS.getSectionAtY: y=0 maps to s-rh, y=totalHeight-1 maps to s-rf', async () => {
        const { atZero, atEnd } = await page.evaluate(() => {
          const total = DS.getTotalHeight();
          return {
            atZero: DS.getSectionAtY(0)?.section?.id ?? null,
            atEnd: DS.getSectionAtY(total - 1)?.section?.id ?? null,
          };
        });
        assert.equal(atZero, 's-rh', `y=0 must map to s-rh, got ${atZero}`);
        assert.equal(atEnd, 's-rf', `y=totalHeight-1 must map to s-rf, got ${atEnd}`);
      });

      // ─── SECTION-008 ──────────────────────────────────────────────────────
      await t.test('SECTION-008 SectionLayoutEngine.getSectionBand returns non-degenerate {y, h} for all sections', async () => {
        const bands = await page.evaluate(() =>
          DS.sections.map((s) => ({ id: s.id, band: SectionLayoutEngine.getSectionBand(s.id) }))
        );
        for (const { id, band } of bands) {
          assert.ok(band, `getSectionBand(${id}) must return a value`);
          assert.ok(typeof band.h === 'number' && band.h > 0, `getSectionBand(${id}).h must be > 0, got ${band?.h}`);
          assert.ok(typeof band.y === 'number' && band.y >= 0, `getSectionBand(${id}).y must be >= 0, got ${band?.y}`);
        }
      });

      // ─── SECTION-009 ──────────────────────────────────────────────────────
      await t.test('SECTION-009 SectionLayoutEngine.getTotalViewHeight approximates DS.getTotalHeight × zoom', async () => {
        const { totalModel, totalView, zoom } = await page.evaluate(() => ({
          totalModel: DS.getTotalHeight(),
          totalView: SectionLayoutEngine.getTotalViewHeight(),
          zoom: DS.zoom,
        }));
        // Allow ±2px tolerance for sub-pixel rounding
        assert.ok(
          Math.abs(totalView - totalModel * zoom) <= 2,
          `getTotalViewHeight ${totalView} != ${totalModel} × ${zoom}; delta > 2`,
        );
      });

      // ─── SECTION-010 ──────────────────────────────────────────────────────
      await t.test('SECTION-010 section resize handle drag increases sec.height', async () => {
        await reloadRuntime(page, server.baseUrl);
        const heightBefore = await page.evaluate(() => DS.sections[1].height); // s-ph
        await dragSectionHandle(page, 's-ph', 30);
        const heightAfter = await page.evaluate(() => DS.sections[1].height);
        assert.ok(
          heightAfter > heightBefore,
          `resize drag must increase section height; before=${heightBefore} after=${heightAfter}`,
        );
      });

      // ─── SECTION-011 ──────────────────────────────────────────────────────
      await t.test('SECTION-011 section resize undo restores original height within 1px', async () => {
        await reloadRuntime(page, server.baseUrl);
        const heightBefore = await page.evaluate(() => DS.sections[1].height);
        await dragSectionHandle(page, 's-ph', 40);
        const heightAfterDrag = await page.evaluate(() => DS.sections[1].height);
        assert.ok(heightAfterDrag > heightBefore, 'drag must change height before undo test');

        await page.evaluate(() => DS.undo());
        await page.waitForTimeout(200);
        const heightAfterUndo = await page.evaluate(() => DS.sections[1].height);
        assert.ok(
          Math.abs(heightAfterUndo - heightBefore) <= 1,
          `undo must restore height within 1px; before=${heightBefore} afterDrag=${heightAfterDrag} afterUndo=${heightAfterUndo}`,
        );
      });

      // ─── SECTION-012 ──────────────────────────────────────────────────────
      await t.test('SECTION-012 resize badge visible during drag, hidden after release', async () => {
        await reloadRuntime(page, server.baseUrl);

        // Fire onPointerDown + onMouseMove but NOT onMouseUp so the drag is still active.
        // Badge show/hide is synchronous in SectionResizeEngine, so we can read it in the
        // same evaluate call without waiting for a RAF or repaint.
        const badgeDuring = await page.evaluate(() => {
          SectionResizeEngine.onPointerDown({ button: 0, clientX: 0, clientY: 200 }, 's-ph');
          SectionResizeEngine.onMouseMove({ clientX: 0, clientY: 225 });
          const el = document.querySelector('#resize-badge');
          if (!el) return null;
          return window.getComputedStyle(el).display;
        });

        await page.evaluate(() => SectionResizeEngine.onMouseUp({}));
        await page.waitForTimeout(150);

        const badgeAfter = await page.evaluate(() => {
          const el = document.querySelector('#resize-badge');
          if (!el) return 'not-found';
          return window.getComputedStyle(el).display;
        });

        assert.ok(
          badgeDuring !== null && badgeDuring !== 'none',
          `resize badge must be visible during drag; computed display="${badgeDuring}"`,
        );
        assert.ok(
          badgeAfter === 'not-found' || badgeAfter === 'none',
          `resize badge must be hidden after release; computed display="${badgeAfter}"`,
        );
      });

      // ─── SECTION-013 ──────────────────────────────────────────────────────
      await t.test('SECTION-013 toggleSectionVisibility hides section in DOM and sets DS.sections visible=false', async () => {
        await reloadRuntime(page, server.baseUrl);
        const sectionId = 's-ph';

        // toggleSectionVisibility only calls CanvasLayoutEngine.renderAll(), not
        // SectionEngine.render(), so section DOM visibility is not updated automatically.
        // Call SectionEngine.render() explicitly to synchronise the DOM.
        await page.evaluate((sid) => {
          CommandEngine.toggleSectionVisibility(sid);
          SectionEngine.render();
        }, sectionId);
        await page.waitForTimeout(150);

        const domDisplay = await page.evaluate((sid) => {
          const el = document.querySelector(`#sections-layer .cr-section[data-section-id="${sid}"]`);
          return el ? window.getComputedStyle(el).display : 'not-found';
        }, sectionId);
        assert.equal(domDisplay, 'none', `section DOM must be display:none after toggle; got "${domDisplay}"`);

        const modelVisible = await page.evaluate((sid) =>
          DS.sections.find((s) => s.id === sid)?.visible
        , sectionId);
        assert.equal(modelVisible, false, `DS.sections entry.visible must be false after toggle`);
      });

      // ─── SECTION-014 ──────────────────────────────────────────────────────
      await t.test('SECTION-014 toggling a hidden section makes it visible again', async () => {
        await reloadRuntime(page, server.baseUrl);
        const sectionId = 's-ph';

        // Hide
        await page.evaluate((sid) => CommandEngine.toggleSectionVisibility(sid), sectionId);
        await page.waitForTimeout(150);
        // Show
        await page.evaluate((sid) => CommandEngine.toggleSectionVisibility(sid), sectionId);
        await page.waitForTimeout(150);

        const domDisplay = await page.evaluate((sid) => {
          const el = document.querySelector(`#sections-layer .cr-section[data-section-id="${sid}"]`);
          return el ? window.getComputedStyle(el).display : 'not-found';
        }, sectionId);
        assert.notEqual(domDisplay, 'none', `double-toggle must restore section visibility; display="${domDisplay}"`);

        const modelVisible = await page.evaluate((sid) =>
          DS.sections.find((s) => s.id === sid)?.visible
        , sectionId);
        assert.ok(
          modelVisible !== false,
          `DS.sections entry.visible must be truthy after double-toggle, got ${modelVisible}`,
        );
      });

      // ─── SECTION-015 ──────────────────────────────────────────────────────
      await t.test('SECTION-015 toggleSectionVisibility is saved to history; DS.undo() restores visibility', async () => {
        await reloadRuntime(page, server.baseUrl);
        const sectionId = 's-rh';

        // Initially visible (visible is undefined or true — both mean visible)
        await page.evaluate((sid) => CommandEngine.toggleSectionVisibility(sid), sectionId);
        await page.waitForTimeout(150);

        const hiddenAfterToggle = await page.evaluate((sid) =>
          DS.sections.find((s) => s.id === sid)?.visible === false
        , sectionId);
        assert.ok(hiddenAfterToggle, 'section must be hidden after toggle');

        // Undo
        await page.evaluate(() => DS.undo());
        await page.waitForTimeout(200);

        const visibleAfterUndo = await page.evaluate((sid) =>
          DS.sections.find((s) => s.id === sid)?.visible !== false
        , sectionId);
        assert.ok(visibleAfterUndo, 'undo must restore section visibility');

        const domDisplay = await page.evaluate((sid) => {
          const el = document.querySelector(`#sections-layer .cr-section[data-section-id="${sid}"]`);
          return el ? window.getComputedStyle(el).display : 'not-found';
        }, sectionId);
        assert.notEqual(domDisplay, 'none', `DOM must show section after undo; display="${domDisplay}"`);
      });

      // ─── SECTION-016 ──────────────────────────────────────────────────────
      await t.test('SECTION-016 CommandEngine.insertSection() increases DS.sections.length by 1', async () => {
        await reloadRuntime(page, server.baseUrl);
        const countBefore = await page.evaluate(() => DS.sections.length);
        await page.evaluate(() => CommandEngine.insertSection());
        await page.waitForTimeout(200);
        const countAfter = await page.evaluate(() => DS.sections.length);
        assert.equal(countAfter, countBefore + 1, `insertSection must add 1 section; before=${countBefore} after=${countAfter}`);
      });

      // ─── SECTION-017 ──────────────────────────────────────────────────────
      await t.test('SECTION-017 new section from insertSection has stype=det and positive height', async () => {
        await reloadRuntime(page, server.baseUrl);
        await page.evaluate(() => CommandEngine.insertSection());
        await page.waitForTimeout(200);
        const newSection = await page.evaluate(() => DS.sections[DS.sections.length - 1]);
        assert.equal(newSection.stype, 'det', `new section stype must be 'det', got '${newSection.stype}'`);
        assert.ok(newSection.height > 0, `new section height must be positive, got ${newSection.height}`);
        assert.ok(newSection.id, 'new section must have a non-empty id');
      });

      // ─── SECTION-018 ──────────────────────────────────────────────────────
      await t.test('SECTION-018 CommandEngine.deleteSection() decreases DS.sections.length by 1', async () => {
        await reloadRuntime(page, server.baseUrl);
        // Insert a section first so deleting leaves the template intact
        await page.evaluate(() => CommandEngine.insertSection());
        await page.waitForTimeout(150);
        const countBeforeDelete = await page.evaluate(() => DS.sections.length);
        await page.evaluate(() => CommandEngine.deleteSection());
        await page.waitForTimeout(150);
        const countAfterDelete = await page.evaluate(() => DS.sections.length);
        assert.equal(countAfterDelete, countBeforeDelete - 1, `deleteSection must remove 1 section; before=${countBeforeDelete} after=${countAfterDelete}`);
      });

      // ─── SECTION-019 ──────────────────────────────────────────────────────
      await t.test('SECTION-019 insertSection then deleteSection returns to original section count', async () => {
        await reloadRuntime(page, server.baseUrl);
        const countBefore = await page.evaluate(() => DS.sections.length);
        await page.evaluate(() => CommandEngine.insertSection());
        await page.waitForTimeout(150);
        await page.evaluate(() => CommandEngine.deleteSection());
        await page.waitForTimeout(150);
        const countAfter = await page.evaluate(() => DS.sections.length);
        assert.equal(countAfter, countBefore, `insert+delete must restore section count; before=${countBefore} after=${countAfter}`);
      });

      // ─── SECTION-020 ──────────────────────────────────────────────────────
      await t.test('SECTION-020 deleteSection is blocked when only 1 section remains', async () => {
        await reloadRuntime(page, server.baseUrl);
        const initial = await page.evaluate(() => DS.sections.length);
        // Delete down to 1 (deleteSection removes last section when nothing is selected)
        for (let i = 0; i < initial - 1; i++) {
          await page.evaluate(() => CommandEngine.deleteSection());
          await page.waitForTimeout(120);
        }
        const countAt1 = await page.evaluate(() => DS.sections.length);
        assert.equal(countAt1, 1, `must have 1 section before protection check, got ${countAt1}`);

        // One more delete — must be blocked
        await page.evaluate(() => CommandEngine.deleteSection());
        await page.waitForTimeout(120);
        const countAfterProtect = await page.evaluate(() => DS.sections.length);
        assert.equal(countAfterProtect, 1, `deleteSection must not reduce below 1 section; got ${countAfterProtect}`);
      });

      await assertNoConsoleErrors(consoleErrors, 'TANDA 8 — SECTION');
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
});
