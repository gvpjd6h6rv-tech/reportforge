'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCheckerSingleContract } from '../../tools/salad-score/checkers/check_checker_single_contract.mjs';

test('checkCheckerSingleContract — passes with zero or one contracts/ import', () => {
  assert.equal(checkCheckerSingleContract('c.mjs', "const x=1;").value, true);
  assert.equal(checkCheckerSingleContract('c.mjs', "import {a} from '../contracts/contract_checker.mjs';").value, true);
});

test('checkCheckerSingleContract — fails with two distinct contracts/ imports', () => {
  const text = "import {a} from '../contracts/contract_checker.mjs';\nimport {b} from '../contracts/contract_metric.mjs';";
  assert.equal(checkCheckerSingleContract('c.mjs', text).value, false);
});
