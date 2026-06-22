'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoMixedIoAndLogic } from '../../tools/salad-score/checkers/check_no_mixed_io_and_logic.mjs';

test('checkNoMixedIoAndLogic — fails when fs/fetch and regex matching coexist', () => {
  const text = "fs.readFileSync('x'); text.match(/y/);";
  assert.equal(checkNoMixedIoAndLogic('f.mjs', text).value, false);
});

test('checkNoMixedIoAndLogic — passes when only one of the two is present', () => {
  assert.equal(checkNoMixedIoAndLogic('f.mjs', "fs.readFileSync('x');").value, true);
  assert.equal(checkNoMixedIoAndLogic('f.mjs', "text.match(/y/);").value, true);
});
