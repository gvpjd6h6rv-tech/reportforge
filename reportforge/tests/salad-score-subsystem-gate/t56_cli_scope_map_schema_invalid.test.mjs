import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runCliInFixture } from './_run_cli_in_fixture.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T56: a scope-map that is syntactically valid JSON but missing the "subsystems" key (schema-invalid) never yields a false PASS', async () => {
  const out = await runCliInFixture(
    { files: [SCENARIO.ownedCleanA], scopeMap: { notSubsystems: {} }, ownershipMap: { subsystems: [] } },
    () => ({ config: CONFIG_PATH, subsystemId: 'SS-VALID' })
  );
  assert.notEqual(out.exitCode, 0);
});
