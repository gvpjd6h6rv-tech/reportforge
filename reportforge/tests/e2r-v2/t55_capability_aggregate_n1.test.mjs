import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCapabilityAggregate,
} from '../../../tools/e2r-v2/calculators/calculate_capability_aggregate.mjs';

test('t55 capability aggregate treats the declared one-member inventory as complete', () => {
  const result = calculateCapabilityAggregate([42], 1);

  assert.equal(result.status, 'COMPLETE_INPUTS');
  assert.equal(result.n, 1);
  assert.equal(result.raw, 42);
});
