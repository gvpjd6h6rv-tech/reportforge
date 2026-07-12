import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const P = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8')).presets.structuralOnlyValid;

test('T60: a structuralOnly subsystem (zero scoreable files BY DESIGN) reports SP_SUBSYSTEM_SCORE=NOT_APPLICABLE and can still PASS', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture(P, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-STRUCTURAL' });
    assert.equal(result.SP_SUBSYSTEM_SCORE, 'NOT_APPLICABLE');
    assert.equal(result.FINAL_GATE_STATUS, 'PASS');
  });
});
