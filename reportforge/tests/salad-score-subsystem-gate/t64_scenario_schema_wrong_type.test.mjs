import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T64: a scenario entry whose "content" is not a string fails SCENARIO-DATA-SCHEMA-01', () => {
  const result = validateScenarioData({ presets: {}, ownedCleanA: { relPath: 'a.mjs', content: 123 } });
  assert.ok(result.evidence.includes('SCENARIO_ENTRY_TYPE_INVALID:ownedCleanA'));
  assert.equal(result.value, false);
});
