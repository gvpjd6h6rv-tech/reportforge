import test from 'node:test';
        import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { runE2RV2 } from '../../../tools/e2r-v2/runner/run_e2r_v2.mjs';

test('t130_invalid_test_evidence_blocked_before_persistence_and_scoring', async () => {
  const sourceRoot = process.cwd();
  const capabilityMap = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'tools/e2r-v2/capability-map/capability_map.json'), 'utf8'));
  const memberFile = capabilityMap.capabilities[0].files.find((file) => file.classification === 'GEOMETRY_MEMBER');
  assert.ok(memberFile);

  // Exactly one evidence record: valid paths, deliberately invalid
  // evidenceStrength/outcome (this is the reviewer's exact repro shape).
  const invalidRecord = {
    name: 'invalid-t130-record',
    productionFile: memberFile.path,
    sourcePath: memberFile.path,
    evidenceStrength: 2,
    outcome: 2,
  };

  const root = fs.mkdtempSync(path.join('/tmp', 'e2r-v2-t130-'));
  fs.cpSync(path.join(sourceRoot, 'engines'), path.join(root, 'engines'), { recursive: true });
  const mapped = new Set(capabilityMap.capabilities[0].files.map((file) => file.path));
  for (const entry of fs.readdirSync(path.join(root, 'engines'), { withFileTypes: true })) {
    if (entry.isFile() && !mapped.has(`engines/${entry.name}`)) fs.unlinkSync(path.join(root, 'engines', entry.name));
  }
  fs.mkdirSync(path.join(root, 'tools/e2r-v2/capability-map'), { recursive: true });
  fs.mkdirSync(path.join(root, 'audit'), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, 'salad-score.config.json'), path.join(root, 'salad-score.config.json'));
  fs.copyFileSync(path.join(sourceRoot, 'tools/e2r-v2/capability-map/capability_map.json'), path.join(root, 'tools/e2r-v2/capability-map/capability_map.json'));
  fs.copyFileSync(path.join(sourceRoot, 'audit/subsystem_ownership_map.json'), path.join(root, 'audit/subsystem_ownership_map.json'));
  const ownershipPath = path.join(root, 'audit/subsystem_ownership_map.json');
  const ownership = JSON.parse(fs.readFileSync(ownershipPath, 'utf8'));
  const claimed = new Set(ownership.subsystems.flatMap((subsystem) => subsystem.allowedFiles || []).map((file) => String(file).replace(/\\/g, '/')));
  const uncovered = capabilityMap.capabilities[0].files
    .map((file) => String(file.path).replace(/\\/g, '/'))
    .filter((file) => !claimed.has(file) && !claimed.has(path.basename(file)));
  ownership.subsystems.push({ id: 'T130-FIXTURE', owner: 'e2r-v2-t130-fixture', allowedFiles: uncovered });
  fs.writeFileSync(ownershipPath, JSON.stringify(ownership));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'salad-score.config.json'), 'utf8'));

  const evidenceFilePath = path.join(root, 'audit/test_evidence_records.json');
  const result = await runE2RV2({
    root,
    config,
    capabilityMapPath: path.join(root, 'tools/e2r-v2/capability-map/capability_map.json'),
    ownershipMapPath: ownershipPath,
    testEvidenceRecords: [invalidRecord],
    strict: false,
  });

  assert.equal(result.evidence.rawSchema.value, false);

  // Distinguish "a file was written" from "a valid record was persisted as
  // authoritative evidence" -- neither may happen for an invalid batch.
  const fileWriteCount = fs.existsSync(evidenceFilePath) ? 1 : 0;
  assert.equal(fileWriteCount, 0);
  assert.equal(result.evidence.persistence.recordCount, 0);

  const scoringConsumedInvalidRecordCount = result.evidence.testEvidenceRecords.filter(
    (record) => record.productionFile === memberFile.path
  ).length;
  assert.equal(scoringConsumedInvalidRecordCount, 0);

  const memberScoring = result.report.files.find((file) => file.path === memberFile.path);
  assert.ok(memberScoring);
  const invalidRecordScoreIsNumeric = Number.isFinite(memberScoring.testEvidence.score);
  assert.equal(invalidRecordScoreIsNumeric, false);

  assert.notEqual(result.report.publicationStatus, 'PUBLISHED');

  fs.rmSync(root, { recursive: true, force: true });
});
