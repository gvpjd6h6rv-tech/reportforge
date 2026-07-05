'use strict';
/**
 * RF-SECTION-MOVE-INK-1 — unit tests for the pure section-move coordinate
 * clamp (engines/DocumentActionsLayoutClamp.js). Loaded in an isolated vm so
 * we can control the CFG.PAGE_W global the module reads for x-clamping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadClamp({ pageW } = {}) {
  const src = fs.readFileSync(resolve(ROOT, 'engines/DocumentActionsLayoutClamp.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  if (pageW !== undefined) ctx.CFG = { PAGE_W: pageW };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

const selectors = (sections) => ({ getSection: (id) => sections.find((s) => s.id === id) || null });

test('y is clamped when target section is shorter than old y + h', () => {
  const clamp = loadClamp();
  const el = { sectionId: 's-ph', x: 68, y: 34, w: 200, h: 12, fieldPath: 'cliente.email', type: 'field', content: 'INK106' };
  const sel = selectors([{ id: 's-ph', height: 34 }, { id: 's-d1', height: 14 }]);
  const out = clamp.clampSectionMovePatch(el, { sectionId: 's-d1' }, sel);
  assert.equal(out.sectionId, 's-d1');
  // max y = 14 - 12 = 2; inherited y=34 must clamp down to 2
  assert.equal(out.y, 2, `expected y clamped to 2, got ${out.y}`);
  assert.ok(out.y >= 0 && out.y <= 14 - el.h, 'y must sit within [0, height-h]');
});

test('y is left unchanged when it already fits the taller target section', () => {
  const clamp = loadClamp();
  const el = { sectionId: 's-d1', x: 10, y: 4, w: 200, h: 12 };
  const sel = selectors([{ id: 's-d1', height: 14 }, { id: 's-rh', height: 250 }]);
  const out = clamp.clampSectionMovePatch(el, { sectionId: 's-rh' }, sel);
  assert.equal(out.y, 4, 'y that already fits must be preserved');
});

test('x is clamped when it would exceed the usable page width', () => {
  const clamp = loadClamp({ pageW: 754 });
  const el = { sectionId: 's-ph', x: 700, y: 4, w: 200, h: 12 };
  const sel = selectors([{ id: 's-ph', height: 100 }, { id: 's-rf', height: 100 }]);
  const out = clamp.clampSectionMovePatch(el, { sectionId: 's-rf' }, sel);
  // max x = 754 - 200 = 554
  assert.equal(out.x, 554, `expected x clamped to 554, got ${out.x}`);
});

test('fieldPath / type / content are never touched by the clamp', () => {
  const clamp = loadClamp();
  const el = { sectionId: 's-ph', x: 5, y: 90, w: 100, h: 12, fieldPath: 'cliente.email', type: 'field', content: 'INK106' };
  const sel = selectors([{ id: 's-ph', height: 100 }, { id: 's-d1', height: 14 }]);
  const out = clamp.clampSectionMovePatch(el, { sectionId: 's-d1' }, sel);
  // the clamp only ever returns x/y/sectionId keys; identity fields stay on el
  assert.equal(el.fieldPath, 'cliente.email');
  assert.equal(el.type, 'field');
  assert.equal(el.content, 'INK106');
  assert.ok(!('fieldPath' in out) && !('type' in out) && !('content' in out),
    'clamp patch must not carry identity fields');
});

test('no-op when sectionId does not change', () => {
  const clamp = loadClamp();
  const el = { sectionId: 's-ph', x: 5, y: 90, w: 100, h: 12 };
  const sel = selectors([{ id: 's-ph', height: 100 }]);
  const out = clamp.clampSectionMovePatch(el, { x: 999 }, sel);
  // value comparison (not deepStrictEqual: the vm-realm object has a
  // different Object.prototype than a test-realm literal)
  assert.equal(out.x, 999, 'x passes through');
  assert.ok(!('sectionId' in out) && !('y' in out), 'no sectionId/clamp added when sectionId unchanged');
});

test('unknown target section leaves the patch untouched (auditable no-op)', () => {
  const clamp = loadClamp();
  const el = { sectionId: 's-ph', x: 5, y: 90, w: 100, h: 12 };
  const sel = selectors([{ id: 's-ph', height: 100 }]);
  const out = clamp.clampSectionMovePatch(el, { sectionId: 's-nope' }, sel);
  assert.equal(out.sectionId, 's-nope');
  assert.ok(!('y' in out), 'no clamp applied when target section is unknown');
});
