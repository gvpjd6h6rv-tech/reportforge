import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPresetExists } from './scenario_data_preset_exists.mjs';

test('T66: requesting an undeclared preset name fails SCENARIO-DATA-PRESET-EXISTS-01', () => {
  const result = checkPresetExists({ multiOwnerValid: {} }, 'doesNotExist');
  assert.deepEqual(result.evidence, ['PRESET_NOT_FOUND:doesNotExist']);
  assert.equal(result.value, false);
});
