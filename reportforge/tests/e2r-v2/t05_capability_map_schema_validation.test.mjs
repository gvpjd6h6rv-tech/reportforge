import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import { validateCapabilityMap } from '../../../tools/e2r-v2/validators/validate_capability_map.mjs';

test('capability map validator accepts the frozen map', () => {
  const map = JSON.parse(fs.readFileSync('tools/e2r-v2/capability-map/capability_map.json', 'utf8'));
  const physical = map.capabilities[0].files.map((file) => file.path);
  assert.equal(validateCapabilityMap(map, physical).value, true);
});
