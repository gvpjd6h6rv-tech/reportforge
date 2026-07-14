const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkSemanticRuleCompleteness = (await import('../../../tools/e2r-v2/checkers/check_semantic_rule_completeness.mjs')).checkSemanticRuleCompleteness;
test('t03_semantic_rule_completeness', () => {
  const map = JSON.parse('{"capabilities":[{"files":[{"classification":"GEOMETRY_MEMBER","semanticContractRule":"GM-01"},{"classification":"GEOMETRY_DEPENDENT","semanticContractRule":"GD-01"},{"classification":"GEOMETRY_EXCLUDED","semanticContractRule":"GX-01"}]}]}');
  assert.match(map.capabilities[0].files[0].semanticContractRule, /^GM-/);
  assert.match(map.capabilities[0].files[1].semanticContractRule, /^GD-/);
  assert.match(map.capabilities[0].files[2].semanticContractRule, /^GX-/);
  assert.equal(checkSemanticRuleCompleteness(Object.fromEntries([['capabilityMap', map]])).value, true);
  const broken = JSON.parse(JSON.stringify(map));
  broken.capabilities[0].files[0].semanticContractRule = 'BAD-00';
  assert.equal(checkSemanticRuleCompleteness(Object.fromEntries([['capabilityMap', broken]])).value, false);
});
