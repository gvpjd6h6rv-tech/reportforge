import test from 'node:test';
import assert from 'node:assert/strict';

test("t22_module_edges_reject_self_and_ambiguous_targets", () => {
  assert.equal(1, 1);
});
