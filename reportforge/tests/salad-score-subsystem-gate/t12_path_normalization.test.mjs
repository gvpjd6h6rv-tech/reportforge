import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSubsystemPath } from '../../../tools/salad-score/subsystem-gate/checkers/normalize_subsystem_path.mjs';

test('T12: normalizeSubsystemPath converts backslashes to forward slashes (single owner of normalization)', () => {
  assert.equal(normalizeSubsystemPath('a\\b\\c.mjs'), 'a/b/c.mjs');
  assert.equal(normalizeSubsystemPath('a/b/c.mjs'), 'a/b/c.mjs');
});
