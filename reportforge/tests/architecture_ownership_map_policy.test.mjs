import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ownership map declares one responsibility per file and one rule per guard', () => {
  const map = JSON.parse(fs.readFileSync('architecture/ownership-map.json', 'utf8'));

  assert.equal(map.policy.oneFileOneResponsibility, true);
  assert.equal(map.policy.oneOwnerPerFile, true);
  assert.equal(map.policy.oneGuardOneRule, true);
});
