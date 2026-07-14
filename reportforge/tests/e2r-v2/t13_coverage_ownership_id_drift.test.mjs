const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkCoverageOwnershipIdAlignment = (await import('../../../tools/e2r-v2/checkers/check_coverage_ownership_id_alignment.mjs')).checkCoverageOwnershipIdAlignment;
test('t13_coverage_ownership_id_drift', () => {
  const coverage = JSON.parse('[{"subsystemId":"E2R-V2-TOOLING","canonicalOwner":"E2R-V2-TOOLING"},{"subsystemId":"E2R-V2-TESTS","canonicalOwner":"E2R-V2-TESTS"}]');
  const scopeMap = JSON.parse('{"E2R-V2-TOOLING":{"files":["a"]},"E2R-V2-TESTS":{"files":["b"]}}');
  const ownershipMap = JSON.parse('{"subsystems":[{"owner":"E2R-V2-TOOLING","allowedFiles":["a"]},{"owner":"E2R-V2-TESTS","allowedFiles":["b"]}]}');
  assert.equal(checkCoverageOwnershipIdAlignment(Object.fromEntries([['scopeMap', scopeMap], ['ownershipMap', ownershipMap], ['coverageOwnershipIdExceptions', coverage]])).value, true);
  const drifted = JSON.parse(JSON.stringify(coverage));
  drifted[0].canonicalOwner = 'BROKEN';
  assert.equal(checkCoverageOwnershipIdAlignment(Object.fromEntries([['scopeMap', scopeMap], ['ownershipMap', ownershipMap], ['coverageOwnershipIdExceptions', drifted]])).value, false);
});
