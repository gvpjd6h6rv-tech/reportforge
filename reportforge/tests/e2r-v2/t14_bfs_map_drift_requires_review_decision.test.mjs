const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkBfsMapDrift = (await import('../../../tools/e2r-v2/checkers/check_bfs_map_drift.mjs')).checkBfsMapDrift;
test('t14_bfs_map_drift_requires_review_decision', () => {
  assert.equal(checkBfsMapDrift(Object.fromEntries([['bfsCandidates', []], ['reviewedBfsCandidates', []]])).value, true);
  assert.equal(checkBfsMapDrift(Object.fromEntries([['bfsCandidates', JSON.parse('[{"path":"a.js","reviewDecision":"REVIEWED_ACCEPTED"}]')], ['reviewedBfsCandidates', JSON.parse('[{"path":"a.js","reviewDecision":"REVIEWED_ACCEPTED"}]')]])).value, true);
  assert.equal(checkBfsMapDrift(Object.fromEntries([['bfsCandidates', JSON.parse('[{"path":"a.js"}]')], ['reviewedBfsCandidates', []]])).value, false);
});
