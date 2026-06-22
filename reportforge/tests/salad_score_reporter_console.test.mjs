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
