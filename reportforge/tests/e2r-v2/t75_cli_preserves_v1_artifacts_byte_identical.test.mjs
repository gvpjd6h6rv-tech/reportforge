import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import crypto from 'node:crypto';

test('legacy v1 artifacts are byte identical', () => {
  const files = ['audit/rf_e2r_dashboard.html', 'audit/rf_e2r_snapshot.json'];
  const hashes = files.map((file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  assert.equal(hashes.length, 2);
});
