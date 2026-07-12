import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T67: two scenario entries declaring the SAME relPath fail SCENARIO-DATA-SCHEMA-01', () => {
  const result = validateScenarioData({
    presets: {},
    a: { relPath: 'engines/x.mjs', content: '1' },
    b: { relPath: 'engines/x.mjs', content: '2' },
  });
  assert.ok(result.evidence.includes('DUPLICATE_REL_PATH:engines/x.mjs'));
  assert.equal(result.value, false);
});
