import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

test('capability map frozen reconciliation is 55/40/75', () => {
  const files = JSON.parse(fs.readFileSync('tools/e2r-v2/capability-map/capability_map.json', 'utf8')).capabilities[0].files;
  assert.equal(files.filter((f) => f.classification === 'GEOMETRY_MEMBER').length, 55);
  assert.equal(files.filter((f) => f.classification === 'GEOMETRY_DEPENDENT').length, 40);
  assert.equal(files.filter((f) => f.classification === 'GEOMETRY_EXCLUDED').length, 75);
});
