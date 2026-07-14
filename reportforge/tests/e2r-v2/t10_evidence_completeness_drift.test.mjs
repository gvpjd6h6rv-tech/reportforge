const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkEvidenceCompleteness = (await import('../../../tools/e2r-v2/checkers/check_evidence_completeness.mjs')).checkEvidenceCompleteness;
test('t10_evidence_completeness_drift', () => {
  const map = JSON.parse('{"capabilities":[{"files":[{"path":"a.js","evidence":[{"type":"SOURCE_SYMBOL","symbol":"A","lines":"a.js:1-1"}],"reviewedCandidateEvidence":{"evidenceVersion":"1","reviewDecision":"REVIEWED_MEMBER","supportingEdgeIds":[]}}]}]}');
  assert.equal(checkEvidenceCompleteness(Object.fromEntries([['capabilityMap', map]])).value, true);
  const drifted = JSON.parse(JSON.stringify(map));
  drifted.capabilities[0].files[0].evidence = [];
  assert.equal(checkEvidenceCompleteness(Object.fromEntries([['capabilityMap', drifted]])).value, false);
});
