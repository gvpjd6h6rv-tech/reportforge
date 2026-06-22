'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTestSingleContract } from '../../tools/salad-score/checkers/check_test_single_contract.mjs';

test('checkTestSingleContract — passes when importing from exactly one tools/salad-score/ module', () => {
  const text = "import {a} from '../../tools/salad-score/metrics/metric_loc.mjs';";
  assert.equal(checkTestSingleContract('t.test.mjs', text).value, true);
});

test('checkTestSingleContract — fails when importing from two different modules', () => {
  const text = "import {a} from '../../tools/salad-score/metrics/metric_loc.mjs';\nimport {b} from '../../tools/salad-score/metrics/metric_classes.mjs';";
  assert.equal(checkTestSingleContract('t.test.mjs', text).value, false);
});
