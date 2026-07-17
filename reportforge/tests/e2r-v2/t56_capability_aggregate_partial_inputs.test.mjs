import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCapabilityAggregate,
} from '../../../tools/e2r-v2/calculators/calculate_capability_aggregate.mjs';

test('t56 capability aggregate stays provisional when declared member inputs are missing', () => {
  const result = calculateCapabilityAggregate([75], 2);

  assert.equal(result.status, 'PROVISIONAL_INCOMPLETE');
  assert.equal(result.n, 1);
  assert.equal(result.raw, 75);
});
