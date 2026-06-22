'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reporterMarkdown } from '../../tools/salad-score/reporters/reporter_markdown.mjs';

test('reporterMarkdown — produces a markdown table with the repo score and file rows', () => {
  const out = reporterMarkdown([{ path: 'a.js', sp_total_score: 10, level: 'limpio' }], 42, 5);
  assert.match(out, /# Salad Point Score/);
  assert.match(out, /SP_REPO_SCORE: 42\.00/);
  assert.match(out, /\| a\.js \| 10 \| limpio \|/);
});
