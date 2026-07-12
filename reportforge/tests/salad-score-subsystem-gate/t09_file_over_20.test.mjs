import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T9: a scoped file whose sp_total_score exceeds 20 surfaces in FILES_OVER_20 (real repo content, materialized)', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.bigFile],
    scopeMap: { subsystems: { 'SS-OVER20': { files: ['engines/big_file.mjs'], allOwnedFiles: ['engines/big_file.mjs'], allowedOwners: ['owner-x'] } } },
    ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['big_file.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-OVER20' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.FILES_OVER_20.length, 1);
    assert.ok(result.FILES_OVER_20[0].includes('big_file.mjs'));
  });
});
