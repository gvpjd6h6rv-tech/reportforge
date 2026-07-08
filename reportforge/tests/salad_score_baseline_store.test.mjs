'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBaseline, saveBaseline, buildBaselineFromResults } from '../../tools/salad-score/ci/salad_score_baseline_store.mjs';

function tmpPath() {
  return path.join(os.tmpdir(), `salad-score-baseline-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('salad_score_baseline_store_roundtrip — save then load returns the same scores', () => {
  const file = tmpPath();
  const results = [
    { path: 'a.js', sp_total_score: 12 },
    { path: 'b.js', sp_total_score: 88 },
  ];
  saveBaseline(file, results);
  const loaded = loadBaseline(file);
  assert.deepEqual(loaded, { 'a.js': 12, 'b.js': 88 });
  fs.rmSync(file);
});

test('salad_score_baseline_store_missing_file_returns_empty_object', () => {
  const loaded = loadBaseline(path.join(os.tmpdir(), 'this-file-does-not-exist-12345.json'));
  assert.deepEqual(loaded, {});
});

test('salad_score_baseline_store_sorts_keys — output is stable/sorted for readable diffs', () => {
  const file = tmpPath();
  saveBaseline(file, [
    { path: 'zebra.js', sp_total_score: 1 },
    { path: 'apple.js', sp_total_score: 2 },
  ]);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  assert.deepEqual(Object.keys(parsed.scores), ['apple.js', 'zebra.js']);
  fs.rmSync(file);
});

test('salad_score_build_baseline_from_results_maps_path_to_score', () => {
  const built = buildBaselineFromResults([{ path: 'x.js', sp_total_score: 33 }]);
  assert.deepEqual(built, { scores: { 'x.js': 33 } });
});
