import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

test('member layer counts reconcile to the frozen totals', () => {
  const files = JSON.parse(fs.readFileSync('tools/e2r-v2/capability-map/capability_map.json', 'utf8')).capabilities[0].files;
  const counts = {};
  for (const file of files) {
    if (file.classification === 'GEOMETRY_MEMBER') counts[file.primaryLayer] = (counts[file.primaryLayer] || 0) + 1;
  }
  assert.deepEqual(counts, { GEOMETRY_CORE: 4, GEOMETRY_MODEL: 7, GEOMETRY_LAYOUT: 8, GEOMETRY_HIT_TEST: 4, GEOMETRY_RENDER: 15, GEOMETRY_INTERACTION: 13, GEOMETRY_ADAPTER: 4 });
});
