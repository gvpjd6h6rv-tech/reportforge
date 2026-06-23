'use strict';
/**
 * SPD1C — static source-text assertions for the new "🥗 SP Dashboard" button,
 * mirroring the non-Playwright half of
 * reportforge/tests/rf_debug_center_detached_window.test.mjs (this repo's
 * own established pattern for verifying a Debug Center button's markup and
 * wiring without a live browser). The "Open Window" button it sits next to
 * lives in tools/rf-debug-center/rf-debug-center-view.js's header actions —
 * same place this button is added.
 *
 * Unlike "Open Window" (which delegates through actions.openDetachedWindow
 * -> a stateful synced-window subsystem), this button has no state to sync —
 * it only opens a pre-generated static file — so it is wired directly to
 * window.open(...) in the view, with no new action/runtime/scoring touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startRuntimeServer, launchRuntimePage, assertNoConsoleErrors } from './runtime_harness.mjs';

const SOURCE = fs.readFileSync(path.join(process.cwd(), 'tools/rf-debug-center/rf-debug-center-view.js'), 'utf8');

test('button exists with the correct id, in the header actions area', () => {
  assert.match(SOURCE, /id="rf-debug-center-salad-score"/);
});

test('button label/emoji is exactly "🥗 SP Dashboard"', () => {
  assert.match(SOURCE, />🥗 SP Dashboard</);
});

test('button has an aria-label and a title attribute', () => {
  const buttonMatch = SOURCE.match(/<button[^>]*id="rf-debug-center-salad-score"[^>]*>/);
  assert.ok(buttonMatch, 'button markup must exist');
  assert.match(buttonMatch[0], /aria-label="[^"]+"/);
  assert.match(buttonMatch[0], /title="[^"]+"/);
});

test('button opens window.open with the exact safe arguments — noopener, noreferrer, _blank', () => {
  assert.match(SOURCE, /window\.open\(\s*['"]reports\/salad-score-dashboard\.html['"]\s*,\s*['"]_blank['"]\s*,\s*['"]noopener,noreferrer['"]\s*\)/);
});

test('the button click handler does not call fetch/exec/subprocess/eval — only window.open', () => {
  const handlerMatch = SOURCE.match(/saladScore\.onclick\s*=\s*\(\)\s*=>\s*\{?[^;]*\}?;?/);
  assert.ok(handlerMatch, 'onclick wiring for the salad-score button must exist');
  const handler = handlerMatch[0];
  assert.doesNotMatch(handler, /fetch\s*\(/);
  assert.doesNotMatch(handler, /eval\s*\(/);
  assert.doesNotMatch(handler, /subprocess|child_process|exec\s*\(/);
  assert.match(handler, /window\.open\(/);
});

test('the button is wired with a real getElementById lookup inside renderDebugCenter, same as the other header buttons', () => {
  assert.match(SOURCE, /getElementById\('rf-debug-center-salad-score'\)/);
});

test('scoring/runner files are untouched by this change (patch minimo, no scoring tocado)', () => {
  for (const f of [
    'tools/salad-score/scoring/score_file.mjs',
    'tools/salad-score/scoring/score_behavior.mjs',
    'tools/salad-score/scoring/score_total.mjs',
    'tools/salad-score/scoring/score_repo.mjs',
    'tools/salad-score/runner/run_salad_score.mjs',
  ]) {
    assert.doesNotMatch(SOURCE, new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

// SPD1F — real-browser smoke: a real click against the real reportforge_server.py
// must actually load the generated dashboard, not 404. This is the gap static
// source-text assertions above cannot catch: the server's route table
// (reportforge_server_services.py) only forwarded /static/* and
// .js/.css/.svg/.png to _serve_static — a real click on this button 404'd in
// production until that route table was extended (confirmed via a real
// screenshot before the fix: {"error": "Not found: /reports/..."}).
test('real browser click opens the dashboard tab with real content, not a 404', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());

  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await page.waitForFunction(() => !!document.getElementById('rf-debug-center-root')?.shadowRoot);

    const newPagePromise = page.context().waitForEvent('page', { timeout: 5000 });
    await page.evaluate(() => document.getElementById('rf-debug-center-root')?.shadowRoot?.getElementById('rf-debug-center-salad-score')?.click());
    const dashboardPage = await newPagePromise;
    await dashboardPage.waitForLoadState('domcontentloaded');

    const url = dashboardPage.url();
    assert.match(url, /\/reports\/salad-score-dashboard\.html$/);

    const body = await dashboardPage.evaluate(() => document.body.textContent || '');
    assert.doesNotMatch(body, /"error"\s*:\s*"Not found/, 'click must not 404 — real production bug found via SPD1F visual smoke');
    assert.match(body, /SP_REPO_SCORE/);
    assert.match(body, /Resumen/);

    await dashboardPage.close();
    await assertNoConsoleErrors(consoleErrors, 'salad score dashboard button real click');
  } finally {
    await browser.close();
    await server.stop();
  }
});
