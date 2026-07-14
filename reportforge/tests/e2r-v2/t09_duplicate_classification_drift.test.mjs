const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkDuplicateClassification = (await import('../../../tools/e2r-v2/checkers/check_duplicate_classification.mjs')).checkDuplicateClassification;
test('t09_duplicate_classification_drift', () => {
  const map = JSON.parse('{"capabilities":[{"files":[{"path":"a.js"}]}]}');
  assert.equal(checkDuplicateClassification(Object.fromEntries([['capabilityMap', map]])).value, true);
  const drifted = JSON.parse(JSON.stringify(map));
  drifted.capabilities[0].files.push(JSON.parse(JSON.stringify(drifted.capabilities[0].files[0])));
  assert.equal(checkDuplicateClassification(Object.fromEntries([['capabilityMap', drifted]])).value, false);
});
