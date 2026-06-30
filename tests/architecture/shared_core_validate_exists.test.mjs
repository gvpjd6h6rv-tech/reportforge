'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSharedCoreValidateExists } from '../../tools/guards/shared_core/shared_core_validate_exists.mjs';

test('checkSharedCoreValidateExists — passes when validate_repo.sh exists', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  fs.writeFileSync(path.join(d, 'validate_repo.sh'), '#!/usr/bin/env bash');
  assert.equal(checkSharedCoreValidateExists(d).value, true);
});

test('checkSharedCoreValidateExists — fails when validate_repo.sh is absent', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  const r = checkSharedCoreValidateExists(d);
  assert.equal(r.value, false);
  assert.ok(r.evidence[0].includes('validate_repo.sh'));
});
