const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkOwnershipJoinConsistency = (await import('../../../tools/e2r-v2/checkers/check_ownership_join_consistency.mjs')).checkOwnershipJoinConsistency;
test('t15_ownership_join_consistency_states', () => {
  const rows = JSON.parse('[{"relative":"a.js","ownerState":"RESOLVED","owners":["E2R-V2-TOOLING"],"canonicalOwner":"E2R-V2-TOOLING"},{"relative":"b.js","ownerState":"UNOWNED","owners":[],"canonicalOwner":null},{"relative":"c.js","ownerState":"CONFLICT","owners":["E2R-V2-TOOLING","E2R-V2-TESTS"],"canonicalOwner":null}]');
  assert.equal(checkOwnershipJoinConsistency(Object.fromEntries([['ownershipRows', rows]])).value, true);
  const drifted = JSON.parse(JSON.stringify(rows));
  drifted[0].owners = [];
  drifted[0].canonicalOwner = null;
  assert.equal(checkOwnershipJoinConsistency(Object.fromEntries([['ownershipRows', drifted]])).value, false);
});
