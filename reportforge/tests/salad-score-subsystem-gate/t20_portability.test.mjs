import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T20: the SAME core works against a second, differently-shaped repo (no hardcoding)', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.widgetAlpha, SCENARIO.widgetBeta],
    scopeMap: { subsystems: { 'ACME-WIDGETS': { files: ['lib/widget_alpha.mjs', 'lib/widget_beta.mjs'], allOwnedFiles: ['lib/widget_alpha.mjs', 'lib/widget_beta.mjs'], allowedOwners: ['acme-widget-team'] } } },
    ownershipMap: { subsystems: [{ owner: 'acme-widget-team', allowedFiles: ['widget_alpha.mjs', 'widget_beta.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'ACME-WIDGETS' });
    assert.equal(result.FINAL_GATE_STATUS, 'PASS');
    assert.equal(result.SUBSYSTEM_ID, 'ACME-WIDGETS');
  });
});
