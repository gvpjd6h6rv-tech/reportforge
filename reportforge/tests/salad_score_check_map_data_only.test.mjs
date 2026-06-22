'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMapDataOnly } from '../../tools/salad-score/checkers/check_map_data_only.mjs';

test('checkMapDataOnly — passes on valid JSON', () => {
  assert.equal(checkMapDataOnly('m.json', '{"a":1}').value, true);
});

test('checkMapDataOnly — fails on invalid JSON', () => {
  const r = checkMapDataOnly('m.json', '{not json');
  assert.equal(r.value, false);
  assert.equal(r.evidence.length, 1);
});
