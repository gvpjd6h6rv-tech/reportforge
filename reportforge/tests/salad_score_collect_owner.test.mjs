'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOwner } from '../../tools/salad-score/collectors/collect_owner.mjs';

test('collectOwner — returns the subsystem owner when the basename is in allowedFiles', () => {
  const map = { subsystems: [{ owner: 'ss-1', allowedFiles: ['Foo.js'] }], sharedFiles: [] };
  assert.equal(collectOwner('/x/y/Foo.js', map), 'ss-1');
});

test('collectOwner — returns "shared" when the basename is in sharedFiles', () => {
  const map = { subsystems: [], sharedFiles: ['Shared.js'] };
  assert.equal(collectOwner('/x/Shared.js', map), 'shared');
});

test('collectOwner — returns "unowned" when the basename is claimed nowhere', () => {
  const map = { subsystems: [{ owner: 'ss-1', allowedFiles: [] }], sharedFiles: [] };
  assert.equal(collectOwner('/x/Ghost.js', map), 'unowned');
});
