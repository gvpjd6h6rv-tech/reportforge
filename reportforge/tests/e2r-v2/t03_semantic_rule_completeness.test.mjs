import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

test('each classification has the correct rule prefix', () => {
  const files = JSON.parse(fs.readFileSync('tools/e2r-v2/capability-map/capability_map.json', 'utf8')).capabilities[0].files;
  for (const file of files) {
    if (file.classification === 'GEOMETRY_MEMBER') assert.match(file.semanticContractRule, /^GM-/);
    if (file.classification === 'GEOMETRY_DEPENDENT') assert.match(file.semanticContractRule, /^GD-/);
    if (file.classification === 'GEOMETRY_EXCLUDED') assert.match(file.semanticContractRule, /^GX-/);
  }
});
