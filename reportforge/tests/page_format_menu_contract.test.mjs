import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('page-format menu creation, dispatch, and dialog loading form one UI contract', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'engines/MenuAdapters.js'), 'utf8');
  const handler = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeHandlersLayout.js'), 'utf8');
  const dialog = fs.readFileSync(path.join(ROOT, 'designer/PageFormatDialog.js'), 'utf8');

  assert.match(menu, /ensurePageFormatMenuItem\(\)/);
  assert.match(menu, /page-format/);
  assert.match(menu, /Formato de página/);
  assert.match(handler, /'page-format': openPageFormatDialog/);
  assert.match(handler, /import\('\/designer\/PageFormatDialog\.js'\)/);
  assert.match(dialog, /export function openPageFormatDialog/);
  assert.match(dialog, /\[58, 70, 76\]/);
});
