'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoHiddenSideEffects } from '../../tools/salad-score/checkers/check_no_hidden_side_effects.mjs';

test('checkNoHiddenSideEffects — fails when fs/fetch/console appear', () => {
  assert.equal(checkNoHiddenSideEffects('m.mjs', "fs.readFileSync('x')").value, false);
  assert.equal(checkNoHiddenSideEffects('m.mjs', "console.log('x')").value, false);
});

test('checkNoHiddenSideEffects — passes for pure computation', () => {
  assert.equal(checkNoHiddenSideEffects('m.mjs', "return text.length;").value, true);
});
