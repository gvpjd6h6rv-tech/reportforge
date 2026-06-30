'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkOwnershipFilesExist } from '../../tools/guards/ownership/ownership_files_exist.mjs';

function setup(subsystems, diskFiles) {
  const d   = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  const eng = path.join(d, 'engines');
  fs.mkdirSync(eng);
  for (const f of diskFiles) fs.writeFileSync(path.join(eng, f), '');
  const mapPath = path.join(d, 'ownership_map.json');
  fs.writeFileSync(mapPath, JSON.stringify({ subsystems }));
  return { mapPath, eng };
}

test('checkOwnershipFilesExist — passes when all allowedFiles exist', () => {
  const { mapPath, eng } = setup(
    [{ id: 'SS-A', domain: 'designer-runtime', allowedFiles: ['Foo.js', 'Bar.js'] }],
    ['Foo.js', 'Bar.js']
  );
  assert.equal(checkOwnershipFilesExist(mapPath, eng).value, true);
});

test('checkOwnershipFilesExist — fails when a declared file is missing on disk', () => {
  const { mapPath, eng } = setup(
    [{ id: 'SS-A', domain: 'designer-runtime', allowedFiles: ['Real.js', 'Ghost.js'] }],
    ['Real.js']
  );
  const r = checkOwnershipFilesExist(mapPath, eng);
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('Ghost.js')));
});

test('checkOwnershipFilesExist — passes when allowedFiles is empty', () => {
  const { mapPath, eng } = setup(
    [{ id: 'SS-B', domain: 'backend-render', allowedFiles: [] }],
    ['Some.js']
  );
  assert.equal(checkOwnershipFilesExist(mapPath, eng).value, true);
});

test('checkOwnershipFilesExist — fails across multiple subsystems', () => {
  const { mapPath, eng } = setup(
    [
      { id: 'SS-A', allowedFiles: ['A.js'] },
      { id: 'SS-B', allowedFiles: ['B.js', 'Missing.js'] },
    ],
    ['A.js', 'B.js']
  );
  const r = checkOwnershipFilesExist(mapPath, eng);
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('SS-B') && e.includes('Missing.js')));
});
