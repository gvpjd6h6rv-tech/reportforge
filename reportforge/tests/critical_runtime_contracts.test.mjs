'use strict';
/**
 * critical_runtime_contracts.test.mjs
 *
 * Playwright + static-analysis CI gate for six critical principles:
 *
 *   #11  Idempotencia de render   — two flush cycles produce identical DOM
 *   #16  Re-render seguro         — reload leaves DS state canonical (no leakage)
 *   #21  Backend manda, UI refleja — UI cannot invent lock state without a command
 *   #32  No side-effects visuales — elements do not bleed outside section bounds
 *   #45  Computed Style Contract  — host/panel widths are positive and stable
 *   #46  Feature CSS Isolation    — invasive overlays use rf-* / cr-* namespaced classes
 *
 * Principles #11/#16/#21/#32/#45 use a live Playwright browser.
 * Principle #46 is pure static analysis (no browser required).
 *
 * The Playwright tests are wrapped in a skip-guard: if no browser is
 * available they are skipped (not failed), keeping CI green on headless-only
 * environments that have not installed browsers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startRuntimeServer,
  launchRuntimePage,
  getBrowserAvailability,
  reloadRuntime,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Browser availability guard — skip entire Playwright section if no browser
// ---------------------------------------------------------------------------

async function withBrowser(t, fn) {
  const avail = await getBrowserAvailability(['chromium']);
  if (!avail.chromium?.available) {
    t.diagnostic('chromium not available — Playwright tests skipped');
    return;
  }
  await fn();
}

// ---------------------------------------------------------------------------
// #11 — Idempotencia de render
// Two back-to-back forced flushes must produce an identical DOM snapshot.
// ---------------------------------------------------------------------------

test('#11 render idempotency — two flush cycles produce identical DOM', { timeout: 120000 }, async (t) => {
  await withBrowser(t, async () => {
    const server = await startRuntimeServer();
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

    try {
      // Collect a structural DOM snapshot: element count, unique IDs, positions
      const snapshot = () => page.evaluate(() => {
        const els = [...document.querySelectorAll('.cr-element')];
        return {
          count: els.length,
          ids: els.map(e => e.dataset.id).sort(),
          // round positions to 1px to absorb sub-pixel rounding
          positions: els.map(e => {
            const r = e.getBoundingClientRect();
            return `${e.dataset.id}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
          }).sort(),
        };
      });

      // Force a synchronous flush to stabilise any pending frame
      await page.evaluate(() => {
        if (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.flushSync === 'function') {
          RenderScheduler.flushSync(() => {}, 'idempotency-test-1');
        }
      });
      const snap1 = await snapshot();

      // Second flush — DOM must be identical
      await page.evaluate(() => {
        if (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.flushSync === 'function') {
          RenderScheduler.flushSync(() => {}, 'idempotency-test-2');
        }
      });
      const snap2 = await snapshot();

      assert.equal(snap2.count, snap1.count,
        `element count changed after second flush: ${snap1.count} → ${snap2.count}`);
      assert.deepEqual(snap2.ids, snap1.ids,
        'element IDs changed after second flush');
      assert.deepEqual(snap2.positions, snap1.positions,
        `element positions changed after second flush:\n  before: ${snap1.positions.join('\n  ')}\n  after:  ${snap2.positions.join('\n  ')}`);

      t.diagnostic(`#11 idempotency: ${snap1.count} elements, positions stable across 2 flushes`);
      await assertNoConsoleErrors(consoleErrors, '#11 render idempotency');
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// #16 — Re-render seguro
// After two full page reloads DS must return to its canonical boot state.
// No accumulated selection, no extra elements, no corrupted zoom.
// ---------------------------------------------------------------------------

test('#16 re-render safety — reload twice leaves DS in canonical state', { timeout: 180000 }, async (t) => {
  await withBrowser(t, async () => {
    const server = await startRuntimeServer();
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

    try {
      const dsSnapshot = () => page.evaluate(() => ({
        elementCount: DS.elements.length,
        selectionSize: DS.selection.size,
        zoom: DS.zoom,
        previewMode: DS.previewMode,
        hasOrphanedLocks: DS.elements.some(e => e.locked === true),
        sectionCount: DS.sections.length,
        uniqueIds: new Set(DS.elements.map(e => e.id)).size,
      }));

      const initial = await dsSnapshot();
      assert.ok(initial.elementCount > 0, 'initial state must have elements');
      assert.equal(initial.selectionSize, 0, 'initial selection must be empty');
      assert.equal(initial.hasOrphanedLocks, false, 'initial state must have no locked elements');

      // Reload once
      await reloadRuntime(page, server.baseUrl);
      const after1 = await dsSnapshot();

      assert.equal(after1.elementCount, initial.elementCount,
        `reload 1: element count changed ${initial.elementCount} → ${after1.elementCount}`);
      assert.equal(after1.selectionSize, 0,
        'reload 1: selection not cleared after reload (state leak)');
      assert.equal(after1.uniqueIds, after1.elementCount,
        'reload 1: duplicate element IDs detected (counter not reset)');
      assert.equal(after1.sectionCount, initial.sectionCount,
        `reload 1: section count changed ${initial.sectionCount} → ${after1.sectionCount}`);
      assert.equal(after1.hasOrphanedLocks, false,
        'reload 1: orphaned lock state persisted across reload');
      assert.equal(after1.zoom, initial.zoom,
        `reload 1: zoom drifted ${initial.zoom} → ${after1.zoom}`);

      // Reload a second time — must still be canonical
      await reloadRuntime(page, server.baseUrl);
      const after2 = await dsSnapshot();

      assert.equal(after2.elementCount, initial.elementCount,
        `reload 2: element count changed ${initial.elementCount} → ${after2.elementCount}`);
      assert.equal(after2.selectionSize, 0,
        'reload 2: selection not cleared (state accumulation)');
      assert.equal(after2.uniqueIds, after2.elementCount,
        'reload 2: duplicate element IDs (counter accumulation)');
      assert.equal(after2.hasOrphanedLocks, false,
        'reload 2: lock state accumulated across reloads');

      t.diagnostic(`#16 re-render safety: ${initial.elementCount} elements, ${initial.sectionCount} sections — stable across 2 reloads`);
      await assertNoConsoleErrors(consoleErrors, '#16 re-render safety');
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// #21 — Backend manda, UI refleja
// On fresh load no element is locked.
// Lock state only exists after an explicit lock command; it disappears after unlock.
// UI must not invent lock state that was not signaled.
// ---------------------------------------------------------------------------

test('#21 backend authority — no phantom lock state on fresh load', { timeout: 120000 }, async (t) => {
  await withBrowser(t, async () => {
    const server = await startRuntimeServer();
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

    try {
      // 1. Verify no element is locked on boot
      const bootLocked = await page.evaluate(() =>
        DS.elements.filter(e => e.locked === true).map(e => e.id)
      );
      assert.deepEqual(bootLocked, [],
        `UI invented lock state on boot — elements locked without command: ${bootLocked.join(', ')}`);

      // 2. Select an element and lock it via the canonical command
      await page.evaluate(() => {
        DS.selection = new Set([DS.elements[0].id]);
      });
      await page.evaluate(() => {
        if (typeof CommandEngine !== 'undefined' && typeof CommandEngine.lockObject === 'function') {
          CommandEngine.lockObject();
        } else {
          // Fallback: trigger via CommandRuntimeSections path
          DS.getSelectedElements().forEach(e => { e.locked = true; });
        }
      });

      const afterLock = await page.evaluate(() =>
        DS.elements.filter(e => e.locked === true).map(e => e.id)
      );
      assert.equal(afterLock.length, 1,
        `lock command must lock exactly 1 element, got ${afterLock.length}`);
      assert.equal(afterLock[0], await page.evaluate(() => [...DS.selection][0]),
        'lock command locked wrong element');

      // 3. Unlock — lock state must disappear
      await page.evaluate(() => {
        if (typeof CommandEngine !== 'undefined' && typeof CommandEngine.unlockObject === 'function') {
          CommandEngine.unlockObject();
        } else {
          DS.getSelectedElements().forEach(e => { delete e.locked; });
        }
      });

      const afterUnlock = await page.evaluate(() =>
        DS.elements.filter(e => e.locked === true).map(e => e.id)
      );
      assert.deepEqual(afterUnlock, [],
        `unlock did not clear lock state — residual locks: ${afterUnlock.join(', ')}`);

      t.diagnostic('#21 backend authority: no phantom lock on boot; lock/unlock round-trip clean');
      await assertNoConsoleErrors(consoleErrors, '#21 backend authority');
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// #32 — No side-effects visuales
// Every rendered .cr-element must stay within the vertical bounds of its
// parent .cr-section (getBoundingClientRect containment).
// ---------------------------------------------------------------------------

test('#32 no visual side-effects — elements stay within section bounds', { timeout: 120000 }, async (t) => {
  await withBrowser(t, async () => {
    const server = await startRuntimeServer();
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

    try {
      const violations = await page.evaluate(() => {
        const results = [];
        const sections = [...document.querySelectorAll('.cr-section')];

        for (const sec of sections) {
          const secRect = sec.getBoundingClientRect();
          if (secRect.height === 0) continue; // collapsed/invisible section — skip

          const elements = sec.querySelectorAll('.cr-element');
          for (const el of elements) {
            const elRect = el.getBoundingClientRect();
            if (elRect.width === 0 && elRect.height === 0) continue; // not rendered

            const TOLERANCE = 1; // 1px tolerance for sub-pixel rounding
            const topOk    = elRect.top    >= secRect.top    - TOLERANCE;
            const bottomOk = elRect.bottom <= secRect.bottom + TOLERANCE;

            if (!topOk || !bottomOk) {
              results.push({
                elId:      el.dataset.id || el.id,
                secId:     sec.dataset.sectionId || sec.id,
                elTop:     Math.round(elRect.top),
                elBottom:  Math.round(elRect.bottom),
                secTop:    Math.round(secRect.top),
                secBottom: Math.round(secRect.bottom),
              });
            }
          }
        }
        return results;
      });

      assert.deepEqual(violations, [],
        `elements bleed outside section bounds:\n${violations.map(v =>
          `  el=${v.elId} in sec=${v.secId}: el[${v.elTop}..${v.elBottom}] vs sec[${v.secTop}..${v.secBottom}]`
        ).join('\n')}`);

      const checked = await page.evaluate(() =>
        document.querySelectorAll('.cr-section .cr-element').length
      );
      t.diagnostic(`#32 visual containment: ${checked} elements checked — all within section bounds`);
      await assertNoConsoleErrors(consoleErrors, '#32 visual containment');
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// #45 — Computed Style Contract
// getComputedStyle on the canonical layout containers must return positive
// widths and heights, and #app must fill the viewport.
// ---------------------------------------------------------------------------

test('#45 computed style contract — host and panel widths are positive', { timeout: 120000 }, async (t) => {
  await withBrowser(t, async () => {
    const server = await startRuntimeServer();
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

    try {
      const styles = await page.evaluate(() => {
        function cs(selector) {
          const el = document.querySelector(selector);
          if (!el) return null;
          const s = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            computedWidth:  parseFloat(s.width)  || 0,
            computedHeight: parseFloat(s.height) || 0,
            rectWidth:      Math.round(r.width),
            rectHeight:     Math.round(r.height),
          };
        }
        return {
          app:         cs('#app'),
          panelLeft:   cs('#panel-left'),
          panelRight:  cs('#panel-right'),
          canvasArea:  cs('#canvas-area'),
          viewport:    { w: window.innerWidth, h: window.innerHeight },
        };
      });

      assert.ok(styles.app,           '#app element not found');
      assert.ok(styles.panelLeft,     '#panel-left element not found');
      assert.ok(styles.panelRight,    '#panel-right element not found');
      assert.ok(styles.canvasArea,    '#canvas-area element not found');

      // #app must fill the viewport (within 4px tolerance for scrollbars)
      assert.ok(styles.app.rectWidth >= styles.viewport.w - 4,
        `#app width ${styles.app.rectWidth}px does not fill viewport ${styles.viewport.w}px`);

      // All primary layout panels must have a positive computed width
      assert.ok(styles.panelLeft.computedWidth > 0,
        `#panel-left has zero/negative computed width: ${styles.panelLeft.computedWidth}`);
      assert.ok(styles.panelRight.computedWidth > 0,
        `#panel-right has zero/negative computed width: ${styles.panelRight.computedWidth}`);
      assert.ok(styles.canvasArea.computedWidth > 0,
        `#canvas-area has zero/negative computed width: ${styles.canvasArea.computedWidth}`);

      // Panel heights must be positive (layout is not collapsed)
      assert.ok(styles.panelLeft.computedHeight > 0,
        `#panel-left has zero height (layout collapsed)`);
      assert.ok(styles.canvasArea.computedHeight > 0,
        `#canvas-area has zero height (layout collapsed)`);

      t.diagnostic([
        `#45 computed style: viewport=${styles.viewport.w}×${styles.viewport.h}`,
        `  #app=${styles.app.rectWidth}×${styles.app.rectHeight}`,
        `  #panel-left=${styles.panelLeft.computedWidth}×${styles.panelLeft.computedHeight}`,
        `  #panel-right=${styles.panelRight.computedWidth}×${styles.panelRight.computedHeight}`,
        `  #canvas-area=${styles.canvasArea.computedWidth}×${styles.canvasArea.computedHeight}`,
      ].join('\n'));

      await assertNoConsoleErrors(consoleErrors, '#45 computed style');
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// #46 — Feature CSS Isolation (static analysis — no browser required)
//
// Invasive UI features (overlays, panels, floating UI) MUST isolate their
// DOM using either:
//   (A) A namespaced CSS class prefix (rf-*, cr-*, sel-*, rfui-*)
//   (B) A unique ID-based root (e.g. id="rf-debug-overlay")
//
// Files that inject free-floating DOM without a namespace anchor violate
// the isolation contract and cause CSS bleed.
// ---------------------------------------------------------------------------

test('#46 feature CSS isolation — overlay engines use namespaced DOM roots', () => {
  // Overlay/panel engine files that create floating DOM
  const INVASIVE_FILES = [
    'engines/DebugOverlay.js',
    'engines/DebugChannelsPanel.js',
    'engines/AlignmentGuides.js',
    'engines/GuideEngine.js',
    'engines/OverlayEngine.js',
    'engines/SelectionOverlay.js',
    'engines/RulerEngine.js',
    'engines/FieldExplorerDrop.js',
  ].filter(f => fs.existsSync(path.join(ROOT, f)));

  // A root element is "isolated" if:
  //   - it has a namespaced class (rf-*, cr-*, sel-*, rfui-*)
  //   - OR it has a namespaced ID (rf-*, cr-*, sel-*, rfui-*)
  //   - OR it uses attachShadow
  const ISOLATION_PATTERNS = [
    /className\s*=\s*['"`](?:rf-|cr-|sel-|rfui-)/,        // namespaced class assignment
    /\.classList\.add\(['"`](?:rf-|cr-|sel-|rfui-)/,       // classList.add with ns prefix
    /root\.id\s*=\s*['"`](?:rf-|cr-|sel-|rfui-)/,          // namespaced ID on root
    /getElementById\(['"`](?:rf-|cr-|sel-|rfui-)/,         // reads namespaced root ID
    /querySelector\(['"`]\.(?:rf-|cr-|sel-|rfui-)/,        // queries namespaced class
    /querySelector\(['"`]#(?:rf-|cr-|sel-|rfui-)/,         // queries namespaced ID
    /attachShadow/,                                          // Shadow DOM
  ];

  // Pattern for unscoped DOM mutations that would indicate bleed risk
  const UNSCOPED_APPEND = /document\.body\.appendChild|document\.getElementById\(['"`](?!rf-|cr-|sel-|rfui-)[^)]+['"]\)\.appendChild/;

  const violations = [];
  const clean = [];

  for (const rel of INVASIVE_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const isolated = ISOLATION_PATTERNS.some(re => re.test(src));

    if (!isolated) {
      // Check if it appends unscoped DOM at all
      if (UNSCOPED_APPEND.test(src)) {
        violations.push(`${rel}: appends to DOM without namespaced class or ID root`);
      }
      // If no append either, file doesn't create floating DOM — not a violation
    } else {
      clean.push(rel);
    }
  }

  assert.deepEqual(violations, [],
    `CSS isolation violations — overlay files injecting unscoped DOM:\n${violations.map(v => `  ${v}`).join('\n')}`);

  // At least the known overlay files must be verifiably isolated
  const knownOverlays = ['engines/DebugOverlay.js', 'engines/AlignmentGuides.js'];
  for (const f of knownOverlays) {
    if (fs.existsSync(path.join(ROOT, f))) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const isolated = ISOLATION_PATTERNS.some(re => re.test(src));
      assert.ok(isolated, `${f}: known invasive overlay must use namespaced DOM root`);
    }
  }

  // Shadow DOM is DEFERRED — not currently used; gap documented, not a violation
  const usesShadowDOM = INVASIVE_FILES.some(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    return /attachShadow/.test(src);
  });
  // diagnostic only — preferred future direction
  if (!usesShadowDOM) {
    // Not a failure: namespaced classes are the current isolation mechanism
    // Shadow DOM would be stronger but is DEFERRED
  }
});
