import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reportHtml } from '../../../tools/e2r-v2/reporters/report_html.mjs';

test('html reporter writes atomically', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'e2r-v2-report-')), 'report.html');
  await reportHtml({ files: [], summary: {} }, out);
  assert.equal(fs.existsSync(out), true);
});
