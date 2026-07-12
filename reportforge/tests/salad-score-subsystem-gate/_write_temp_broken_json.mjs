'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Test-only harness: writes an invalid-JSON temp file, returns its path.
 *  No assertions -- pure setup. Caller is responsible for deleting it. */
export function writeTempBrokenJson(label) {
  const p = path.join(os.tmpdir(), `sss-gate-${label}-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(p, '{ not valid json');
  return p;
}
