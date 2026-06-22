'use strict';
/**
 * Mirrors reportforge/tests/architecture_ownership_guard_self_ownership.test.mjs:
 * every file salad-score itself consists of must be explicitly owned in
 * architecture/ownership-map.json — the tool governs others, so it must be
 * governed too (dogfooding).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

test('every tools/salad-score/*.mjs file is owned by architecture/ownership-map.json', () => {
  const map = JSON.parse(fs.readFileSync('architecture/ownership-map.json', 'utf8'));
  const ownedPaths = new Set(map.rules.map((rule) => rule.path));

  const files = walk('tools/salad-score');
  for (const file of files) {
    assert.equal(ownedPaths.has(file), true, `${file} must be owned`);
  }
});

test('salad-score.config.json is owned by architecture/ownership-map.json', () => {
  const map = JSON.parse(fs.readFileSync('architecture/ownership-map.json', 'utf8'));
  const ownedPaths = new Set(map.rules.map((rule) => rule.path));
  assert.equal(ownedPaths.has('salad-score.config.json'), true);
});

test('tools/salad-score/maps/ownership-map.json is data-only and NOT itself a rule.path (mirrors rf-debug-center precedent)', () => {
  const map = JSON.parse(fs.readFileSync('architecture/ownership-map.json', 'utf8'));
  const ownedPaths = new Set(map.rules.map((rule) => rule.path));
  assert.equal(ownedPaths.has('tools/salad-score/maps/ownership-map.json'), false);
  assert.equal(ownedPaths.has('tools/rf-debug-center/ownership-map.json'), false, 'precedent check');
});
