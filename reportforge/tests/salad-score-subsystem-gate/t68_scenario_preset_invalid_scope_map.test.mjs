import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T68: a preset whose scopeMap is not an object fails SCENARIO-DATA-SCHEMA-01', () => {
  const result = validateScenarioData({ presets: { bad: { files: [], scopeMap: 'not-an-object', ownershipMap: {} } } });
  assert.ok(result.evidence.includes('PRESET_INVALID_SCOPE_MAP:bad'));
  assert.equal(result.value, false);
});
