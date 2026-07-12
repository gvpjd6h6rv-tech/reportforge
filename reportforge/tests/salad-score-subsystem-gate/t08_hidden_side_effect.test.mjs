import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T8: a scoped file with a real top-level side effect surfaces in HIDDEN_SIDE_EFFECTS', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.hiddenEffect],
    scopeMap: { subsystems: { 'SS-HIDDEN': { files: ['engines/hidden_effect_file.mjs'], allOwnedFiles: ['engines/hidden_effect_file.mjs'], allowedOwners: ['owner-y'] } } },
    ownershipMap: { subsystems: [{ owner: 'owner-y', allowedFiles: ['hidden_effect_file.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-HIDDEN' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.HIDDEN_SIDE_EFFECTS.length, 1);
    assert.ok(result.HIDDEN_SIDE_EFFECTS[0].endsWith('hidden_effect_file.mjs'));
  });
});
