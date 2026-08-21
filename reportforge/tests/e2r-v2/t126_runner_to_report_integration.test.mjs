import test from 'node:test';
        import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { runE2RV2 } from '../../../tools/e2r-v2/runner/run_e2r_v2.mjs';

test('t126_runner_to_report_integration', async () => {
  const sourceRoot = process.cwd();
  const root = fs.mkdtempSync(path.join('/tmp', 'e2r-v2-t126-'));
  fs.cpSync(path.join(sourceRoot, 'engines'), path.join(root, 'engines'), { recursive: true });
  const capabilityMap = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'tools/e2r-v2/capability-map/capability_map.json'), 'utf8'));
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
  ownership.subsystems.push({ id: 'T126-FIXTURE', owner: 'e2r-v2-t126-fixture', allowedFiles: uncovered });
  fs.writeFileSync(ownershipPath, JSON.stringify(ownership));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'salad-score.config.json'), 'utf8'));

  // Explicit, caller-supplied execution records -- exactly what a real test
  // runner integration reports after actually executing tests. The runner
  // must transport these through collect -> validate -> persist -> load ->
  // score unchanged; it must never derive them itself from capabilityMap.
  const explicitRecords = capabilityMap.capabilities[0].files
    .filter((file) => file.classification === 'GEOMETRY_MEMBER')
    .map((file) => ({
      name: file.path.split('/').pop(),
      productionFile: file.path,
      sourcePath: file.path,
      evidenceStrength: 'DIRECT_CALL_ASSERTION',
      outcome: 'PASS',
    }));

  const result = await runE2RV2({
    root,
    config,
    capabilityMapPath: path.join(root, 'tools/e2r-v2/capability-map/capability_map.json'),
    ownershipMapPath: ownershipPath,
    testEvidenceRecords: explicitRecords,
    strict: true,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.rawSchema.value, true);
  assert.equal(result.evidence.loaded.status, 'COMPLETE');
  assert.equal(result.evidence.fileTestEvidence.status, 'COMPLETE');
  const records = result.evidence.fileTestEvidence.records;
  const canonicalRecords = result.evidence.canonicalTestEvidenceRecords;
  assert.equal(records.length, explicitRecords.length);
  assert.equal(canonicalRecords.length, explicitRecords.length);
  const evidenceRecord = canonicalRecords[0];
  assert.equal(typeof evidenceRecord.productionFile, 'string');
  assert.equal(evidenceRecord.sourcePath, evidenceRecord.productionFile);
  assert.equal(evidenceRecord.evidenceStrength, 1);
  assert.equal(evidenceRecord.outcome, 1);
  const reportEvidence = records.find((record) => record.productionFile === evidenceRecord.productionFile);
  assert.ok(reportEvidence);
  assert.equal(reportEvidence.evidenceStrength, 1);
  assert.equal(reportEvidence.outcome, 1);
  const reportFile = result.report.files.find((file) => file.path === evidenceRecord.productionFile);
  assert.ok(reportFile);
  assert.equal(reportFile.testEvidence.status, 'COMPLETE');
  assert.equal(reportFile.testEvidence.canonicalExecutionCount, 1);
  assert.equal(reportFile.testEvidence.score, 100);
  assert.equal(result.report.scoreObservabilityStatus, 'COMPLETE');
  assert.equal(result.report.publicationStatus, 'PUBLISHED');
  assert.deepEqual(result.evidence.diagnostics, []);
  assert.equal(result.report.validation.strictFailures, 0);

  fs.rmSync(root, { recursive: true, force: true });
});
