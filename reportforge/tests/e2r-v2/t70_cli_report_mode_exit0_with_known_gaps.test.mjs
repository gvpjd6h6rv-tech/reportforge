import test from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../../../tools/e2r-v2/bin/e2r-v2.mjs';

test('cli report mode exits 0', async () => {
  const result = await main(['--root', '.', '--config', 'salad-score.config.json', '--capability-map', 'tools/e2r-v2/capability-map/capability_map.json', '--ownership-map', 'audit/subsystem_ownership_map.json']);
  assert.equal(result.exitCode, 0);
});
