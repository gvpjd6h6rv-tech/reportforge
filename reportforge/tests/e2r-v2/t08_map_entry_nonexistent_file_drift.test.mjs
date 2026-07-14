const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const checkMapEntryNonexistentFile = (await import('../../../tools/e2r-v2/checkers/check_map_entry_nonexistent_file.mjs')).checkMapEntryNonexistentFile;
test('t08_map_entry_nonexistent_file_drift', () => {
  const map = JSON.parse('{"capabilities":[{"files":[{"path":"package.json"}]}]}');
  assert.equal(checkMapEntryNonexistentFile(Object.fromEntries([['root', '.'], ['capabilityMap', map]])).value, true);
  const drifted = JSON.parse(JSON.stringify(map));
  drifted.capabilities[0].files[0].path = 'missing/DefinitelyMissing.js';
  assert.equal(checkMapEntryNonexistentFile(Object.fromEntries([['root', '.'], ['capabilityMap', drifted]])).value, false);
});
