'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function materializeFixtureRepo(scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2r-v2-fixture-'));
  for (const [rel, text] of Object.entries(scenario.files || {})) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
