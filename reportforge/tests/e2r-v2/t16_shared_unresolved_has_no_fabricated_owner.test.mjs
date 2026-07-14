const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkSharedCanonicalOwner = (await import('../../../tools/e2r-v2/checkers/check_shared_canonical_owner.mjs')).checkSharedCanonicalOwner;
test('t16_shared_unresolved_has_no_fabricated_owner', () => {
  assert.equal(checkSharedCanonicalOwner(Object.fromEntries([['ownershipRows', JSON.parse('[{"relative":"a.js","ownerState":"RESOLVED","canonicalOwner":"E2R-V2-TOOLING","owners":["E2R-V2-TOOLING"]}]')]])).value, true);
  assert.equal(checkSharedCanonicalOwner(Object.fromEntries([['ownershipRows', JSON.parse('[{"relative":"shared.js","ownerState":"SHARED_UNRESOLVED","canonicalOwner":"E2R-V2-TOOLING","owners":[]}]')]])).value, false);
});
