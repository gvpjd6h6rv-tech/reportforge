import test from 'node:test';
import assert from 'node:assert/strict';

test("t43_test_collector_ignores_unrelated_test", () => {
  assert.equal(1, 1);
});
