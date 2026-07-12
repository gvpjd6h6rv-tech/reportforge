import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T65: a scenario entry with an empty relPath fails SCENARIO-DATA-SCHEMA-01', () => {
  const result = validateScenarioData({ presets: {}, ownedCleanA: { relPath: '', content: 'x' } });
  assert.ok(result.evidence.includes('SCENARIO_ENTRY_TYPE_INVALID:ownedCleanA'));
  assert.equal(result.value, false);
});
