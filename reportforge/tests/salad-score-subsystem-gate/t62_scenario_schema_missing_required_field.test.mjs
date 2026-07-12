import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T62: a scenario-data root missing the required "presets" field fails SCENARIO-DATA-SCHEMA-01', () => {
  const result = validateScenarioData({ ownedCleanA: { relPath: 'a.mjs', content: 'x' } });
  assert.ok(result.evidence.includes('MISSING_REQUIRED_FIELD:presets'));
  assert.equal(result.value, false);
});
