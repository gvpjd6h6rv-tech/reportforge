import test from 'node:test';
        import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { runE2RV2 } from '../../../tools/e2r-v2/runner/run_e2r_v2.mjs';
import { collectTestEvidenceRecords } from '../../../tools/e2r-v2/collectors/collect_test_evidence_records.mjs';

test('t129_no_synthetic_test_evidence_without_execution_records', async () => {
  const sourceRoot = process.cwd();
  const capabilityMap = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'tools/e2r-v2/capability-map/capability_map.json'), 'utf8'));
  const memberCount = capabilityMap.capabilities[0].files.filter((file) => file.classification === 'GEOMETRY_MEMBER').length;
  assert.ok(memberCount > 0);

  // Leaf contract: collectTestEvidenceRecords never fabricates a passing
  // record purely from capability-map membership when no explicit records
  // (EXPLICIT_EXECUTION_RECORD_COUNT=0) are supplied.
  const collected = collectTestEvidenceRecords({ capabilityMap });
  assert.equal(collected.records.length, 0);
  assert.equal(collected.status, 'NOT_OBSERVABLE');
  const syntheticPassCount = collected.records.filter((r) => r.evidenceStrength === 1 && r.outcome === 1).length;
  assert.equal(syntheticPassCount, 0);

  // End-to-end contract: the real runner, invoked the normal way (no
  // execution records), must never publish a fabricated result.
  const root = fs.mkdtempSync(path.join('/tmp', 'e2r-v2-t129-'));
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
  ownership.subsystems.push({ id: 'T129-FIXTURE', owner: 'e2r-v2-t129-fixture', allowedFiles: uncovered });
  fs.writeFileSync(ownershipPath, JSON.stringify(ownership));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'salad-score.config.json'), 'utf8'));

  const result = await runE2RV2({
    root,
    config,
    capabilityMapPath: path.join(root, 'tools/e2r-v2/capability-map/capability_map.json'),
    ownershipMapPath: ownershipPath,
    strict: false,
  });

  assert.equal(result.evidence.canonicalTestEvidenceRecords.length, 0);
  assert.equal(result.evidence.fileTestEvidence.status, 'NOT_OBSERVABLE');
  assert.equal(result.report.scoreObservabilityStatus, 'NOT_OBSERVABLE');
  assert.notEqual(result.report.publicationStatus, 'PUBLISHED');

  fs.rmSync(root, { recursive: true, force: true });
});
