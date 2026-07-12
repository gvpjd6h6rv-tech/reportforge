import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReportViewModel } from '../../../tools/e2r-v2/reporters/build_report_view_model.mjs';

test('html and json consume the same report view model shape', () => {
  const vm = buildReportViewModel({ files: [], summary: { ok: true }, publicationStatus: 'PROVISIONAL' });
  assert.deepEqual(vm.summary, { ok: true });
});
