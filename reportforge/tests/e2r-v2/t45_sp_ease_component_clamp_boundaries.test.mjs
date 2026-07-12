import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSpEaseComponent } from '../../../tools/e2r-v2/calculators/normalize_sp_ease_component.mjs';

test('sp ease clamps to 0..100', () => {
  assert.equal(normalizeSpEaseComponent(-5), 100);
  assert.equal(normalizeSpEaseComponent(20), 80);
  assert.equal(normalizeSpEaseComponent(130), 0);
});
