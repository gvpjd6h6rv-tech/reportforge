import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('ownership architecture guard CLI passes', () => {
  const output = execFileSync('node', ['audit/architecture_guard.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.match(output, /ARCHITECTURE_GUARD_OK/);
  assert.match(output, /owner=debug-center-api/);
  assert.match(output, /owner=visual-doctor-api/);
  assert.match(output, /owner=visual-doctor-core/);
});
