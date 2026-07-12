import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

test('capability map frozen reconciliation is 56/39/76', () => {
  const files = JSON.parse(fs.readFileSync('tools/e2r-v2/capability-map/capability_map.json', 'utf8')).capabilities[0].files;
  assert.equal(files.filter((f) => f.classification === 'GEOMETRY_MEMBER').length, 56);
  assert.equal(files.filter((f) => f.classification === 'GEOMETRY_DEPENDENT').length, 39);
  assert.equal(files.filter((f) => f.classification === 'GEOMETRY_EXCLUDED').length, 76);
});
