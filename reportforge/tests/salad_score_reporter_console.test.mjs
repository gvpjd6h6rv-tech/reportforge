'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reporterConsole } from '../../tools/salad-score/reporters/reporter_console.mjs';

test('reporterConsole — includes SP_REPO_SCORE and the file count', () => {
  const out = reporterConsole([{ path: 'a.js', sp_total_score: 10, level: 'limpio' }], 42, 5);
  assert.match(out, /SP_REPO_SCORE: 42\.00/);
  assert.match(out, /files scanned: 1/);
  assert.match(out, /a\.js/);
});

test('reporterConsole — top=0 lists no per-file rows', () => {
  const out = reporterConsole([{ path: 'a.js', sp_total_score: 10, level: 'limpio' }], 42, 0);
  assert.doesNotMatch(out, /a\.js/);
});

// ── SP-MARGIN-01: METRIC MARGIN WARNINGS section ────────────────────────────────

test('reporterConsole — shows WARNING/FAIL metric margins', () => {
  const results = [{
    path: 'a.js', sp_total_score: 10, level: 'limpio',
    metric_margins: [
      { key: 'loc', label: 'raw LOC', status: 'WARNING', value: 361, limit: 400, okTarget: 360 },
      { key: 'complexity', label: 'complexity', status: 'FAIL', value: 90, limit: 80, okTarget: 72 },
    ],
  }];
  const out = reporterConsole(results, 42, 0);
  assert.match(out, /METRIC MARGIN WARNINGS/);
  assert.match(out, /a\.js: raw LOC = WARNING/);
  assert.match(out, /a\.js: complexity = FAIL/);
});

test('reporterConsole — hides OK and NOT_APPLICABLE metric margins', () => {
  const results = [{
    path: 'a.js', sp_total_score: 10, level: 'limpio',
    metric_margins: [
      { key: 'loc', label: 'raw LOC', status: 'OK', value: 10, limit: 400, okTarget: 360 },
      { key: 'bytes', label: 'file size (bytes)', status: 'NOT_APPLICABLE', value: null, limit: null, okTarget: null },
    ],
  }];
  const out = reporterConsole(results, 42, 0);
  assert.doesNotMatch(out, /METRIC MARGIN WARNINGS/);
  assert.doesNotMatch(out, /raw LOC/);
});

test('reporterConsole — no metric_margins field at all does not throw (backward compatible)', () => {
  const results = [{ path: 'a.js', sp_total_score: 10, level: 'limpio' }];
  assert.doesNotThrow(() => reporterConsole(results, 42, 0));
});
