'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSaladScore } from '../../tools/salad-score/runner/run_salad_score.mjs';
import { isValidFileResult } from '../../tools/salad-score/contracts/contract_file_result.mjs';

function makeFixture() {
  const dir = path.join(os.tmpdir(), `salad-score-run-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Clean.js'), "function a() { return 1; }\n");
  fs.writeFileSync(path.join(dir, 'God.js'), `window.X = 1;\n${Array.from({ length: 10 }, (_, i) => `function f${i}(){ if(true){} }`).join('\n')}\n`);
  return dir;
}

const CONFIG = JSON.parse(fs.readFileSync('salad-score.config.json', 'utf8'));
const OWNERSHIP_MAP_PATH = path.resolve('audit/subsystem_ownership_map.json');

test('runSaladScore — produces one valid contract_file_result per scanned file', () => {
  const dir = makeFixture();
  const { repoScore, files } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH });
  assert.equal(files.length, 2);
  for (const f of files) assert.ok(isValidFileResult(f), `invalid result for ${f.path}`);
  assert.equal(typeof repoScore, 'number');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runSaladScore — a file with a top-level side effect scores higher than a clean one', () => {
  const dir = makeFixture();
  const { files } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH });
  const clean = files.find((f) => f.path.endsWith('Clean.js'));
  const god = files.find((f) => f.path.endsWith('God.js'));
  assert.ok(god.sp_total_score > clean.sp_total_score);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runSaladScore — every file is "unowned" against a fixture dir not in the real ownership map', () => {
  const dir = makeFixture();
  const { files } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH });
  assert.ok(files.every((f) => f.owner === 'unowned'));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── SP-MARGIN-01: metric_margins is report-only, never changes the score ───────

test('runSaladScore — every file result carries metric_margins without baselineScores (defaults to {})', () => {
  const dir = makeFixture();
  const { files } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH });
  for (const f of files) {
    assert.ok(Array.isArray(f.metric_margins));
    const sp = f.metric_margins.find((m) => m.key === 'sp_total_score');
    assert.equal(sp.status, 'NOT_APPLICABLE', 'no baselineScores passed -> no baseline for any file');
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runSaladScore — baselineScores keyed by absolute path drives the sp_total_score margin', () => {
  const dir = makeFixture();
  const { files } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH });
  const clean = files.find((f) => f.path.endsWith('Clean.js'));
  const baselineScores = { [clean.path]: clean.sp_total_score };
  const { files: files2 } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH, baselineScores });
  const clean2 = files2.find((f) => f.path.endsWith('Clean.js'));
  const sp = clean2.metric_margins.find((m) => m.key === 'sp_total_score');
  assert.equal(sp.status, 'WARNING'); // current === its own baseline
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runSaladScore — passing baselineScores never changes sp_total_score itself (report-only)', () => {
  const dir = makeFixture();
  const { files: before } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH });
  const baselineScores = Object.fromEntries(before.map((f) => [f.path, 0]));
  const { files: after } = runSaladScore({ roots: [dir], config: CONFIG, ownershipMapPath: OWNERSHIP_MAP_PATH, baselineScores });
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].sp_total_score, before[i].sp_total_score);
    assert.equal(after[i].sp_file_score, before[i].sp_file_score);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
