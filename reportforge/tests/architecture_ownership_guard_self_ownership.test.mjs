import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('architecture guard files are explicitly owned by the ownership map', () => {
  const map = JSON.parse(fs.readFileSync('architecture/ownership-map.json', 'utf8'));
  const ownedPaths = new Set(map.rules.map((rule) => rule.path));

  const guardFiles = fs.readdirSync('audit/architecture')
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => path.join('audit/architecture', name));

  guardFiles.push('audit/architecture_guard.mjs');

  for (const file of guardFiles) {
    assert.equal(ownedPaths.has(file), true, `${file} must be owned`);
  }
});
