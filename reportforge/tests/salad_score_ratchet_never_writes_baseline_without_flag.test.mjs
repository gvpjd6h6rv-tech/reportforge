'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = path.join(ROOT, 'audit/salad_score_baseline.json');
const RATCHET_BIN = path.join(ROOT, 'tools/salad-score/bin/salad-score-ratchet.mjs');

test('contract: running the ratchet WITHOUT --update-baseline never modifies the baseline file', () => {
  const before = fs.readFileSync(BASELINE_PATH, 'utf8');
  try {
    execFileSync('node', [RATCHET_BIN], { cwd: ROOT, stdio: 'pipe' });
  } catch (err) {
    // A non-zero exit (real regression detected) is fine for this
    // contract — the only thing under test is whether the FILE changed.
  }
  const after = fs.readFileSync(BASELINE_PATH, 'utf8');
  assert.equal(after, before, 'baseline file content must be byte-identical without --update-baseline');
});
