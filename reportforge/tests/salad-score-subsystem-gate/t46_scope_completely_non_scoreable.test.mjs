import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));

test('T46: a subsystem declaring ONLY non-scoreable files (zero scoreable) never computes a score -- fails with NOT_OBSERVABLE, never SP=0', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [{ relPath: 'config.json', content: '{}' }],
    scopeMap: { subsystems: { 'SS-ALLNONSCORE': { files: [], nonScoreableFiles: ['config.json'], allOwnedFiles: ['config.json'], allowedOwners: [] } } },
    ownershipMap: { subsystems: [{ owner: 'governance', allowedFiles: ['config.json'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-ALLNONSCORE' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.CHECKS.hasScoreable, 'FAIL');
    assert.notEqual(result.SP_SUBSYSTEM_SCORE, 0);
    assert.match(String(result.SP_SUBSYSTEM_SCORE), /NOT_OBSERVABLE/);
  });
});
