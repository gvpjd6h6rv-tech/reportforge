import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));

test('T4: a known subsystem with an empty declared file list fails the gate', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [],
    scopeMap: { subsystems: { 'SS-EMPTY': { files: [], allOwnedFiles: [], allowedOwners: [] } } },
    ownershipMap: { subsystems: [] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-EMPTY' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.CHECKS.scopeNonempty, 'FAIL');
  });
});
