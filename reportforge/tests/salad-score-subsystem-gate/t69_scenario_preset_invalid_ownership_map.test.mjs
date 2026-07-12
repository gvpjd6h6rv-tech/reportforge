import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T69: a preset whose ownershipMap is missing fails SCENARIO-DATA-SCHEMA-01', () => {
  const result = validateScenarioData({ presets: { bad: { files: [], scopeMap: {} } } });
  assert.ok(result.evidence.includes('PRESET_INVALID_OWNERSHIP_MAP:bad'));
  assert.equal(result.value, false);
});
