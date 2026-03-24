import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ContractGuards } = require('../../engines/EngineCore.js');

test('ContractGuards accepts canonical contracts', () => {
  const rect = { left: 1, top: 2, width: 3, height: 4 };
  const selection = new Set(['e1', 'e2']);
  const layout = { id: 'e1', sectionId: 's-ph', x: 1, y: 2, w: 3, h: 4 };
  assert.equal(ContractGuards.assertRectShape(rect, 'test'), rect);
  assert.equal(ContractGuards.assertSelectionState(selection, 'test'), selection);
  assert.equal(ContractGuards.assertLayoutContract(layout, 'test'), layout);
  assert.equal(ContractGuards.assertZoomContract(1.25, 'test'), 1.25);
});

test('ContractGuards fail fast on invalid contracts', () => {
  assert.throws(() => ContractGuards.assertRectShape({ x: 1, y: 2, w: 3, h: 4 }, 'bad-rect'), /INVALID RECT SHAPE/);
  assert.throws(() => ContractGuards.assertSelectionState(['e1'], 'bad-selection'), /INVALID SELECTION STATE/);
  assert.throws(() => ContractGuards.assertLayoutContract({ id: 'e1', x: 1, y: 2, w: 3, h: 4 }, 'bad-layout'), /INVALID LAYOUT CONTRACT/);
  assert.throws(() => ContractGuards.assertZoomContract('1', 'bad-zoom'), /INVALID ZOOM CONTRACT/);
});

test('canonical engines reference contract guards explicitly', () => {
  const files = {
    selection: path.resolve('engines/SelectionEngine.js'),
    canvas: path.resolve('engines/CanvasLayoutEngine.js'),
    preview: path.resolve('engines/PreviewEngine.js'),
    core: path.resolve('engines/EngineCore.js'),
  };

  const selection = fs.readFileSync(files.selection, 'utf8');
  const canvas = fs.readFileSync(files.canvas, 'utf8');
  const preview = fs.readFileSync(files.preview, 'utf8');
  const core = fs.readFileSync(files.core, 'utf8');

  assert.match(selection, /assertRectShape/);
  assert.match(selection, /assertSelectionState/);
  assert.match(selection, /assertZoomContract/);

  assert.match(canvas, /assertLayoutContract/);
  assert.match(canvas, /assertSelectionState/);
  assert.match(canvas, /assertZoomContract/);

  assert.match(preview, /assertSelectionState/);
  assert.match(preview, /assertLayoutContract/);
  assert.match(preview, /assertZoomContract/);

  assert.match(core, /INVALID RECT SHAPE/);
  assert.match(core, /INVALID SELECTION STATE/);
  assert.match(core, /INVALID LAYOUT CONTRACT/);
  assert.match(core, /INVALID ZOOM CONTRACT/);
});

test('runtime engines do not consume legacy rect keys x/y/w/h', () => {
  const files = [
    path.resolve('engines/SelectionEngine.js'),
    path.resolve('engines/CanvasLayoutEngine.js'),
    path.resolve('engines/PreviewEngine.js'),
  ];

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\bgr\.x\b/);
    assert.doesNotMatch(src, /\bgr\.y\b/);
    assert.doesNotMatch(src, /\bgr\.w\b/);
    assert.doesNotMatch(src, /\bgr\.h\b/);
  }
});

test('canonical runtime engines consume selection, zoom and layout from DS', () => {
  const files = {
    selection: path.resolve('engines/SelectionEngine.js'),
    canvas: path.resolve('engines/CanvasLayoutEngine.js'),
    preview: path.resolve('engines/PreviewEngine.js'),
    core: path.resolve('engines/EngineCore.js'),
  };

  const selection = fs.readFileSync(files.selection, 'utf8');
  const canvas = fs.readFileSync(files.canvas, 'utf8');
  const preview = fs.readFileSync(files.preview, 'utf8');
  const core = fs.readFileSync(files.core, 'utf8');

  assert.match(selection, /\bDS\.selection\b/);
  assert.match(selection, /\bDS\.zoom\b/);
  assert.match(selection, /\bDS\.getElementById\b/);

  assert.match(canvas, /\bDS\.selection\b/);
  assert.match(canvas, /\bDS\.zoom\b/);
  assert.match(canvas, /\bDS\.getElementById\b/);

  assert.match(preview, /\bDS\.selection\b/);
  assert.match(preview, /\bDS\.zoom\b/);

  assert.match(core, /\bDS\.selection\b/);
  assert.match(core, /\bDS\.zoom\b/);
  assert.match(core, /\bDS\.elements\b/);
});
