const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkMissingClassification = (await import('../../../tools/e2r-v2/checkers/check_missing_classification.mjs')).checkMissingClassification;
test('t07_semantic_status_drops_on_physical_drift', () => {
  const map = JSON.parse('{"capabilities":[{"files":[{"path":"a.js","classification":"GEOMETRY_MEMBER"}]}]}');
  assert.equal(checkMissingClassification(Object.fromEntries([['physicalPaths', ['a.js']], ['capabilityMap', map]])).value, true);
  const drifted = JSON.parse(JSON.stringify(map));
  delete drifted.capabilities[0].files[0].classification;
  assert.equal(checkMissingClassification(Object.fromEntries([['physicalPaths', ['a.js']], ['capabilityMap', drifted]])).value, false);
});
