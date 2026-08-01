'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { collectTestEvidenceRecords } from '../collectors/collect_test_evidence_records.mjs';

export function loadTestEvidenceRecords(input = { path: 'audit/test_evidence_records.json' }) {
  const recordPath = path.resolve(input?.path ?? input);
  if (!fs.existsSync(recordPath)) {
    return { path: recordPath, records: [], status: 'NOT_OBSERVABLE', diagnostics: [{ code: 'TEST_EVIDENCE_RECORDS_MISSING', path: recordPath }] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    const records = collectTestEvidenceRecords({ records: parsed }).records;
    return {
      path: recordPath,
      records,
      status: records.length ? 'COMPLETE' : 'NOT_OBSERVABLE',
      diagnostics: [],
    };
  } catch (error) {
    return { path: recordPath, records: [], status: 'NOT_OBSERVABLE', diagnostics: [{ code: 'TEST_EVIDENCE_RECORDS_PARSE_ERROR', path: recordPath }] };
  }
}
