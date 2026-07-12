import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateScenarioData } from './scenario_data_schema_validator.mjs';

test('T61: the real scenario-data/scenarios.json passes SCENARIO-DATA-SCHEMA-01', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));
  const result = validateScenarioData(raw);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.value, true);
});
