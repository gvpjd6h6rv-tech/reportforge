import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../../../tools/e2r-v2/bin/e2r-v2.mjs';

test('cli writes explicit json output', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2r-v2-json-'));
  const out = path.join(dir, 'report.json');
  await main(['--root', '.', '--config', 'salad-score.config.json', '--capability-map', 'tools/e2r-v2/capability-map/capability_map.json', '--ownership-map', 'audit/subsystem_ownership_map.json', '--write-json', out]);
  assert.equal(fs.existsSync(out), true);
});
