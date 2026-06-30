'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSharedCoreDocSection } from '../../tools/guards/shared_core/shared_core_doc_section.mjs';

function tmpCanon(content) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-')), 'testing-canon.md');
  fs.writeFileSync(p, content);
  return p;
}

test('checkSharedCoreDocSection — passes with section and validate_repo.sh reference', () => {
  assert.equal(checkSharedCoreDocSection(tmpCanon('## Shared Core Standards\nvalidate_repo.sh')).value, true);
});

test('checkSharedCoreDocSection — fails when section is missing', () => {
  const r = checkSharedCoreDocSection(tmpCanon('## Other Section\nvalidate_repo.sh'));
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('Shared Core Standards')));
});

test('checkSharedCoreDocSection — fails when validate_repo.sh not mentioned', () => {
  const r = checkSharedCoreDocSection(tmpCanon('## Shared Core Standards\nno script reference'));
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('validate_repo.sh')));
});

test('checkSharedCoreDocSection — fails when file does not exist', () => {
  const r = checkSharedCoreDocSection('/nonexistent/testing-canon.md');
  assert.equal(r.value, false);
});
