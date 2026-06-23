'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function load(ds, extraDom = {}) {
  const ctx = { globalThis: {}, document: undefined, DS: ds, ...extraDom };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(resolve(ROOT, 'engines/SelectionDragPreviewSync.js'), 'utf8');
  vm.runInContext(src, ctx);
  return ctx.SelectionDragPreviewSync;
}

function makeDS(overrides = {}) {
  return {
    previewMode: true,
    elements: [
      { id: 'a', sectionId: 's1' },
      { id: 'b', sectionId: 's1' },
      { id: 'c', sectionId: 's2' },
    ],
    getSection(id) { return { 's1': { id: 's1', iterates: null }, 's2': { id: 's2', iterates: 'items' } }[id] || null; },
    ...overrides,
  };
}

test('previewRenderElementIndex — index is position within elements of the same section, not the global array', () => {
  const S = load(makeDS());
  assert.equal(S.previewRenderElementIndex('s1', 'a'), 0);
  assert.equal(S.previewRenderElementIndex('s1', 'b'), 1);
  assert.equal(S.previewRenderElementIndex('s2', 'c'), 0);
});

test('previewRenderElementIndex — unknown element or section returns -1', () => {
  const S = load(makeDS());
  assert.equal(S.previewRenderElementIndex('s1', 'nope'), -1);
  assert.equal(S.previewRenderElementIndex('s-missing', 'a'), -1);
});

test('findPreviewRenderNodes — returns [] when not in preview mode', () => {
  const S = load(makeDS({ previewMode: false }));
  assert.equal(S.findPreviewRenderNodes({ id: 'a', sectionId: 's1' }).length, 0);
});

test('findPreviewRenderNodes — returns [] when the section does not exist', () => {
  const S = load(makeDS());
  assert.equal(S.findPreviewRenderNodes({ id: 'a', sectionId: 'missing' }).length, 0);
});

test('findPreviewRenderNodes — queries .cr-section for static sections, .cr-detail-row for iterating ones, scoped by data-el-index', () => {
  const queries = [];
  const fakeDocument = {
    querySelectorAll(selector) {
      queries.push(selector);
      return [];
    },
  };
  const S = load(makeDS(), { document: fakeDocument });
  S.findPreviewRenderNodes({ id: 'a', sectionId: 's1' });
  assert.match(queries[0], /\.cr-section\[data-section-id="s1"\]/);
  assert.match(queries[0], /\[data-el-index="0"\]/);

  S.findPreviewRenderNodes({ id: 'c', sectionId: 's2' });
  assert.match(queries[1], /\.cr-detail-row\[data-section-id="s2"\]/);
  assert.match(queries[1], /\[data-el-index="0"\]/);
});

test('dragTransformStyle — no-op on a missing node (does not throw)', () => {
  const S = load(makeDS());
  assert.doesNotThrow(() => S.dragTransformStyle(null, {}, {}, 0, 0, 0));
});

test('dragTransformStyle — sets left/top to the snapped model position and transform to the raw-vs-snapped drift', () => {
  const S = load(makeDS());
  const node = { style: {} };
  const el = { x: 50, y: 30 };
  const orig = { x: 10, y: 5, sectionTop: 0 };
  // dx/dy = 38/22 -> raw = (48, 27); snapped el position = (50, 30) -> drift = (-2, -3)
  S.dragTransformStyle(node, el, orig, 0, 38, 22);
  assert.equal(node.style.left, '50px');
  assert.equal(node.style.top, '30px');
  assert.equal(node.style.transform, 'translate(-2.000px, -3.000px)');
});

test('dragTransformStyle — zero drift (raw exactly matches snapped) produces an identity transform', () => {
  const S = load(makeDS());
  const node = { style: {} };
  const el = { x: 50, y: 30 };
  const orig = { x: 50, y: 30, sectionTop: 0 };
  S.dragTransformStyle(node, el, orig, 0, 0, 0);
  assert.equal(node.style.transform, 'translate(0.000px, 0.000px)');
});
