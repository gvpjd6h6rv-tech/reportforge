import test from 'node:test';
import assert from 'node:assert/strict';

import { validateE2RReport } from '../../../tools/e2r-v2/validators/validate_e2r_report.mjs';

test('report validator accepts the minimal required shape', () => {
  assert.equal(validateE2RReport({ phaseId: 'x', capabilityId: 'y', generatedAt: 'z', files: [], summary: {} }).value, true);
});
