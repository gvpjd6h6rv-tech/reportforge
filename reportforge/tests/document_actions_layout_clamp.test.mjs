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

// ── DESIGNER-DRAG-LINE-SECTION-LOCK-01 ─────────────────────────────────
// An element taller than its own section (e.g. a vertical line) overflows
// the band-height check on EVERY move, even when y is unchanged. The fix
// gates the overflow/carry re-owner on curY !== element.y (real vertical
// intent), not merely "patch has a y key".
const listSelectors = (sections) => ({
  sections,
  getSection: (id) => sections.find((s) => s.id === id) || null,
});

test('DRAG-LOCK-01: horizontal-only move on an oversized element does not change sectionId', () => {
  const clamp = loadClamp();
  // vline1: h=60 in a 30px-tall section, bottom overflows 30px into the next band
  const el = { sectionId: 's-A', x: 50, y: 0, w: 2, h: 60 };
  const sel = listSelectors([{ id: 's-A', height: 30 }, { id: 's-B', height: 150 }]);
  const out = clamp.normalizeElementLayout(el, { x: 150, y: 0 }, sel);
  assert.ok(!('sectionId' in out), `sectionId must stay owned by s-A, got patch ${JSON.stringify(out)}`);
});

test('DRAG-LOCK-01: horizontal-only move on an oversized element leaves y unchanged', () => {
  const clamp = loadClamp();
  const el = { sectionId: 's-A', x: 50, y: 0, w: 2, h: 60 };
  const sel = listSelectors([{ id: 's-A', height: 30 }, { id: 's-B', height: 150 }]);
  const out = clamp.normalizeElementLayout(el, { x: 150, y: 0 }, sel);
  assert.equal(out.y, 0, 'y must be preserved on a horizontal-only move');
});

test('DRAG-LOCK-01: horizontal-only move on an oversized element still applies x', () => {
  const clamp = loadClamp();
  const el = { sectionId: 's-A', x: 50, y: 0, w: 2, h: 60 };
  const sel = listSelectors([{ id: 's-A', height: 30 }, { id: 's-B', height: 150 }]);
  const out = clamp.normalizeElementLayout(el, { x: 150, y: 0 }, sel);
  assert.equal(out.x, 150, 'x must reflect the drag delta');
});

test('DRAG-LOCK-01: bottom overflow alone (no y delta) does not reparent a regular element either', () => {
  const clamp = loadClamp();
  // a normal-height element whose section is shorter than the element itself
  const el = { sectionId: 's-A', x: 10, y: 0, w: 20, h: 40 };
  const sel = listSelectors([{ id: 's-A', height: 30 }, { id: 's-B', height: 150 }]);
  const out = clamp.normalizeElementLayout(el, { x: 20, y: 0 }, sel);
  assert.ok(!('sectionId' in out), 'overflow alone must never re-own sectionId without a real y delta');
});

test('DRAG-LOCK-01: horizontal-only move does not snap an already out-of-band y back into range', () => {
  // Real factura_a4.json scenario: a line created at y=15 (h=60, section
  // height=30) via mkEl never went through this clamp at creation time.
  // The anti-straddle y-clamp used to run unconditionally (maxY=0 for an
  // oversized element), so even a horizontal-only move snapped y to 0.
  const clamp = loadClamp();
  const el = { sectionId: 's-A', x: 40, y: 15, w: 2, h: 60 };
  const sel = listSelectors([{ id: 's-A', height: 30 }, { id: 's-B', height: 150 }]);
  const out = clamp.normalizeElementLayout(el, { x: 140, y: 15 }, sel);
  assert.ok(!('y' in out) || out.y === 15, `y must not be re-clamped on a horizontal-only move, got ${JSON.stringify(out)}`);
});

test('DRAG-LOCK-01: genuine vertical intent (y actually changes) still crosses the section boundary', () => {
  const clamp = loadClamp();
  // regression guard: the fix must not break the legitimate cross-section
  // drag/nudge feature (Policy A) for a real vertical move.
  const el = { sectionId: 's-A', x: 50, y: 0, w: 2, h: 60 };
  const sel = listSelectors([{ id: 's-A', height: 30 }, { id: 's-B', height: 150 }]);
  const out = clamp.normalizeElementLayout(el, { x: 50, y: 40 }, sel);
  assert.equal(out.sectionId, 's-B', 'a real vertical move must still re-own into the section under the element');
});
