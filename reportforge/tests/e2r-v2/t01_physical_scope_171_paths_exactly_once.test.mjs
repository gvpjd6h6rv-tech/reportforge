import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

test('capability map has 171 physical files', () => {
  const map = JSON.parse(fs.readFileSync('tools/e2r-v2/capability-map/capability_map.json', 'utf8'));
  assert.equal(map.capabilities[0].files.length, 171);
});
