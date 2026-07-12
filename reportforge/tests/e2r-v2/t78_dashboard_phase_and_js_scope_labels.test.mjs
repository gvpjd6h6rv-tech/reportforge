import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReportViewModel } from '../../../tools/e2r-v2/reporters/build_report_view_model.mjs';

test('view model includes phase and scope labels', () => {
  const vm = buildReportViewModel({ files: [], summary: {}, publicationStatus: 'PROVISIONAL' });
  assert.equal(vm.phaseLabel, 'E2R V2 PHASE 1');
  assert.match(vm.capabilityLabel, /GEOMETRY/);
});
