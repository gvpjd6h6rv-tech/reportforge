
'use strict';

import path from 'node:path';
import { writeTextFileAtomically } from '../io/write_text_file_atomically.mjs';
import { collectTestEvidenceRecords } from '../collectors/collect_test_evidence_records.mjs';

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const left = [a?.productionFile ?? '', a?.sourcePath ?? '', a?.name ?? ''];
    const right = [b?.productionFile ?? '', b?.sourcePath ?? '', b?.name ?? ''];
    return left.join('\\u0000').localeCompare(right.join('\\u0000'));
  });
}

export function persistTestEvidenceRecords(records = [], outputPath = path.resolve('audit/test_evidence_records.json')) {
  const canonical = collectTestEvidenceRecords({ records }).records;
  const sorted = sortRecords(canonical);
  const text = `${JSON.stringify(sorted, null, 2)}
`;
  const writtenPath = writeTextFileAtomically(outputPath, text);
  return { path: writtenPath, records: sorted, recordCount: sorted.length, text };
}
