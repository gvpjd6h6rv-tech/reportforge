import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));

test('T23: a declared file of an unsupported type (never scanned) surfaces as MISSING_FILES and fails -- never silently ignored', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [{ relPath: 'scripts/legacy.py', content: '# not scanned by collectFileList (.js/.mjs only)\n' }],
    scopeMap: { subsystems: { 'SS-UNSUPPORTED': { files: ['scripts/legacy.py'], allOwnedFiles: ['scripts/legacy.py'], allowedOwners: [] } } },
    ownershipMap: { subsystems: [] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-UNSUPPORTED' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.MISSING_SCOREABLE_FILES.length, 1);
    assert.ok(result.MISSING_SCOREABLE_FILES[0].endsWith('legacy.py'));
  });
});
