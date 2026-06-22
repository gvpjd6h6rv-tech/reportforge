'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRunnerOnlyOrchestration } from '../../tools/salad-score/checkers/check_runner_only_orchestration.mjs';

test('checkRunnerOnlyOrchestration — fails on direct regex matching', () => {
  assert.equal(checkRunnerOnlyOrchestration('r.mjs', "text.match(/x/)").value, false);
});

test('checkRunnerOnlyOrchestration — passes on pure orchestration calls', () => {
  assert.equal(checkRunnerOnlyOrchestration('r.mjs', "metricLoc(text)").value, true);
});
