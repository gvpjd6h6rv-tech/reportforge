'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BIN = 'tools/salad-score/bin/salad-score.mjs';

function run(args, opts = {}) {
  try {
    const stdout = execFileSync('node', [BIN, ...args], { encoding: 'utf8', cwd: process.cwd(), ...opts });
    return { stdout, status: 0 };
  } catch (err) {
    return { stdout: err.stdout, stderr: err.stderr, status: err.status };
  }
}

test('CLI — audit --format console exits 0 and prints SP_REPO_SCORE', () => {
  const r = run(['audit', '--format', 'console', '--summary']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /SP_REPO_SCORE/);
});

test('CLI — exit code 2 on an unknown flag', () => {
  const r = run(['audit', '--bogus']);
  assert.equal(r.status, 2);
});

test('CLI — exit code 5 when --root does not exist', () => {
  const r = run(['audit', '--root', '/definitely-not-a-real-path-xyz']);
  assert.equal(r.status, 5);
});

test('CLI — exit code 1 when --max-score is exceeded, 0 when it is not', () => {
  const violated = run(['audit', '--max-score', '1', '--summary']);
  assert.equal(violated.status, 1);
  const satisfied = run(['audit', '--max-score', '100', '--summary']);
  assert.equal(satisfied.status, 0);
});

test('CLI — --format json --output writes a parseable report with the real file count', () => {
  const out = 'reports/salad-score.json';
  run(['audit', '--format', 'json', '--output', out]);
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(parsed.filesScanned > 0);
  assert.equal(parsed.files.length, parsed.filesScanned);
});

test('CLI — --format markdown --output writes a real markdown report', () => {
  const out = 'reports/salad-score.md';
  run(['audit', '--format', 'markdown', '--output', out]);
  const text = fs.readFileSync(out, 'utf8');
  assert.match(text, /# Salad Point Score/);
});
