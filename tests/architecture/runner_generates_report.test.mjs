'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGuards } from '../../tools/runners/run_guards.mjs';

test('runGuards — writes report JSON to specified path', async () => {
  const reportPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-')), 'report.json');
  await runGuards({ mode: 'modular', reportPath });
  assert.ok(fs.existsSync(reportPath), 'report file must be written');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.ok(report.summary, 'must have summary');
  assert.equal(report.blocking, false, 'blocking must be false');
});

test('runGuards — report has required top-level fields', async () => {
  const r = await runGuards({ mode: 'modular' });
  assert.ok(typeof r.summary === 'object');
  assert.ok(Array.isArray(r.modularResults));
  assert.ok(Array.isArray(r.legacyResults));
  assert.ok(Array.isArray(r.comparisons));
  assert.equal(r.blocking, false);
});

test('runGuards dual — report includes per-guard elapsed timing', async () => {
  const r = await runGuards({ mode: 'dual' });
  const hasElapsed = r.modularResults.every(x => typeof x.elapsed === 'number');
  assert.ok(hasElapsed, 'every modular result must have numeric elapsed');
});
