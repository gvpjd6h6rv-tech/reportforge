const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkDependentMemberEdge = (await import('../../../tools/e2r-v2/checkers/check_dependent_member_edge.mjs')).checkDependentMemberEdge;
test('t11_dependent_missing_member_edge_drift', () => {
  const map = JSON.parse('{"capabilities":[{"files":[{"path":"member.js","classification":"GEOMETRY_MEMBER"},{"path":"dep.js","classification":"GEOMETRY_DEPENDENT","reviewedCandidateEvidence":{"reviewDecision":"REVIEWED_DEPENDENT"}}]}]}');
  assert.equal(checkDependentMemberEdge(Object.fromEntries([['capabilityMap', map], ['moduleEdges', []]])).value, true);
  assert.equal(checkDependentMemberEdge(Object.fromEntries([['capabilityMap', map], ['moduleEdges', JSON.parse('[{"from":"dep.js","to":"other.js","kind":"import"}]')]])).value, false);
});
