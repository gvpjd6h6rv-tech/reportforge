'use strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
export function runCliCapture(cwd, args) {
  const before = new Set();
  for (const entry of walk(cwd)) before.add(entry);
  const result = spawnSync(process.execPath, ['tools/e2r-v2/bin/e2r-v2.mjs', ...args], { cwd, encoding: 'utf8' });
  const after = [...walk(cwd)];
  const writes = after.filter((entry) => !before.has(entry));
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, writes };
}
function* walk(root) {
  for (const name of fs.readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, name.name);
    if (name.isDirectory()) yield* walk(abs);
    else yield path.relative(root, abs).split(path.sep).join('/');
  }
}
