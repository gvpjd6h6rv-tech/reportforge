import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkMapDataOnly } from '../../../tools/salad-score/checkers/check_map_data_only.mjs';

test('ARCH3: the real draft subsystem_scope_map.json is valid JSON, data only (official rule; a valid JSON file structurally cannot contain executable logic)', () => {
  const text = fs.readFileSync(fileURLToPath(new URL('../../../tools/salad-score/subsystem-gate/governance/subsystem_scope_map.json', import.meta.url)), 'utf8');
  const result = checkMapDataOnly('subsystem_scope_map.json', text);
  assert.equal(result.value, true, JSON.stringify(result.evidence));
});
