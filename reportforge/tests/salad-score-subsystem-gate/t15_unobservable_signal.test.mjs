import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubsystemResult } from '../../../tools/salad-score/subsystem-gate/runner/build_subsystem_result.mjs';

const PASSING = { value: true, evidence: [] };
test('T15: NON_SCOREABLE_FILES/UNOWNED_NON_SCOREABLE_FILES report empty arrays (not silently 0) when no non-scoreable files are declared', () => {
  const result = buildSubsystemResult({
    subsystemId: 'X', allOwnedFiles: ['a.mjs'], scoreableFiles: ['a.mjs'], nonScoreableFiles: [],
    scannedScoreablePaths: ['a.mjs'], scopedResults: [{ path: 'a.mjs', owner: 'o', sp_total_score: 5, reasons: [] }],
    checks: {
      subsystemIdKnown: PASSING, scopeNonempty: PASSING, hasScoreable: PASSING, noDuplicateScopePaths: PASSING,
      noCrossPartitionDuplicates: PASSING, noScopePathEscape: PASSING, nonScoreableFilesExist: PASSING,
      scoreableFilesScanned: PASSING, noOwnershipViolations: PASSING, nonScoreableOwnership: PASSING,
      noHiddenSideEffectsInScope: PASSING, noFilesOver20: PASSING, ownerInSubsystem: PASSING,
    },
    subsystemScore: 5,
  });
  assert.deepEqual(result.NON_SCOREABLE_FILES, []);
  assert.deepEqual(result.UNOWNED_NON_SCOREABLE_FILES, []);
});
