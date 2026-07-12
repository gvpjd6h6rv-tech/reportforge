import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T63: a scenario entry with an undeclared extra field fails SCENARIO-DATA-SCHEMA-01', () => {
  const result = validateScenarioData({ presets: {}, ownedCleanA: { relPath: 'a.mjs', content: 'x', extraField: 1 } });
  assert.ok(result.evidence.includes('UNKNOWN_FIELD:ownedCleanA.extraField'));
  assert.equal(result.value, false);
});
