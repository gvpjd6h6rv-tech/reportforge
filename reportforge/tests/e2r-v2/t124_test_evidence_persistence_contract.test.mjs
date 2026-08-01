import test from 'node:test';
        import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { persistTestEvidenceRecords } from '../../../tools/e2r-v2/io/persist_test_evidence_records.mjs';
import { loadTestEvidenceRecords } from '../../../tools/e2r-v2/io/load_test_evidence_records.mjs';

test('t124_test_evidence_persistence_contract', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2r-v2-evidence-persist-'));
  const outputPath = path.join(tempDir, 'audit', 'test_evidence_records.json');
  const records = [{ name: 'alpha', productionFile: 'engines/Alpha.js', sourcePath: 'engines/Alpha.js', evidenceStrength: 1, outcome: 1 }];
  const first = persistTestEvidenceRecords(records, outputPath);
  const second = persistTestEvidenceRecords(records, outputPath);
  assert.equal(first.path, outputPath);
  assert.equal(second.path, outputPath);
  assert.equal(first.text, second.text);
  const loaded = loadTestEvidenceRecords(outputPath);
  assert.equal(loaded.status, 'COMPLETE');
  assert.equal(loaded.records.length, 1);
  assert.deepEqual(loaded.records[0], records[0]);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
