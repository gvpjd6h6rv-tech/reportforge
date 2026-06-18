import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('SelectionOverlayPreview loads alone and publishes its public surface', () => {
  const ctx = {
    console,
    globalThis: null,
    window: {},
    module: { exports: {} },
    exports: {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const src = fs.readFileSync(path.join(ROOT, 'engines/SelectionOverlayPreview.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'engines/SelectionOverlayPreview.js' });

  assert.ok(ctx.SelectionOverlayPreview, 'SelectionOverlayPreview should exist on globalThis');
  assert.equal(typeof ctx.SelectionOverlayPreview.ensurePreviewSelectionLayer, 'function');
  assert.equal(typeof ctx.SelectionOverlayPreview.previewRect, 'function');
  assert.equal(typeof ctx.SelectionOverlayPreview.renderSelectionGuides, 'function');
  assert.ok(ctx.module.exports, 'SelectionOverlayPreview should export a module value');
});
