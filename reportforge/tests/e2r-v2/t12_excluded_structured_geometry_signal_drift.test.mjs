const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkExcludedNewGeometrySignal = (await import('../../../tools/e2r-v2/checkers/check_excluded_new_geometry_signal.mjs')).checkExcludedNewGeometrySignal;
test('t12_excluded_structured_geometry_signal_drift', () => {
  const map = JSON.parse('{"capabilities":[{"files":[{"path":"member.js","classification":"GEOMETRY_MEMBER"},{"path":"excluded.js","classification":"GEOMETRY_EXCLUDED","semanticContractRule":"GX-01","reviewedCandidateEvidence":{"reviewDecision":"REVIEWED_EXCLUDED"}}]}]}');
  assert.equal(checkExcludedNewGeometrySignal(Object.fromEntries([['capabilityMap', map], ['moduleEdges', []]])).value, true);
  assert.equal(checkExcludedNewGeometrySignal(Object.fromEntries([['capabilityMap', map], ['moduleEdges', JSON.parse('[{"from":"excluded.js","to":"member.js","kind":"import"}]')]])).value, false);
});
