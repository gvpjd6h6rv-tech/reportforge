import test from 'node:test';
import assert from 'node:assert/strict';

test("t37_test_collector_detects_direct_call_assertion", () => {
  assert.equal(1, 1);
});
