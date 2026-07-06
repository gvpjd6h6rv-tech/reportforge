// RF-PREVIEW-DROP-1 — unit tests for the pure preview-drop coordinate math.
// Metamorphic focus: zoom/scroll must NOT change the resolved band or relY.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { relFromRect } = require('../../engines/FieldExplorerDropCoords.js');

const H = 14;
const PAGE_W = 754;
const SEC_H = 110;

// A section rendered at 1x: rect matches model.
const rect1x = { left: 100, top: 200, width: PAGE_W, height: SEC_H };

test('top of section resolves relY≈0', () => {
  const { relY } = relFromRect(rect1x, 400, 200, SEC_H, PAGE_W, H);
  assert.equal(relY, 0);
});

test('middle of section resolves ≈ half height', () => {
  const { relY } = relFromRect(rect1x, 400, 200 + SEC_H / 2, SEC_H, PAGE_W, H);
  assert.ok(Math.abs(relY - SEC_H / 2) < 1);
});

test('bottom clamps to secH - H (never straddles)', () => {
  const { relY } = relFromRect(rect1x, 400, 200 + SEC_H + 50, SEC_H, PAGE_W, H);
  assert.equal(relY, SEC_H - H);
});

test('x maps to model page coords', () => {
  const { x } = relFromRect(rect1x, 100 + 300, 200, SEC_H, PAGE_W, H);
  assert.ok(Math.abs(x - 300) < 1);
});

test('ZOOM invariance: 2x-scaled rect yields the SAME relY for the same visual point', () => {
  // At 2x, a section rendered at model middle sits at top+SEC_H (scaled).
  const rect2x = { left: 100, top: 200, width: PAGE_W * 2, height: SEC_H * 2 };
  const visualMidY = 200 + SEC_H; // middle of the 2x-tall section
  const a = relFromRect(rect1x, 400, 200 + SEC_H / 2, SEC_H, PAGE_W, H);
  const b = relFromRect(rect2x, 400, visualMidY, SEC_H, PAGE_W, H);
  assert.ok(Math.abs(a.relY - b.relY) < 1, `relY must be zoom-invariant: ${a.relY} vs ${b.relY}`);
});

test('SCROLL invariance: rect follows viewport, same offset yields same relY', () => {
  const scrolled = { left: 100, top: 200 - 500, width: PAGE_W, height: SEC_H }; // scrolled up 500
  const a = relFromRect(rect1x, 400, 200 + 30, SEC_H, PAGE_W, H);
  const b = relFromRect(scrolled, 400, (200 - 500) + 30, SEC_H, PAGE_W, H);
  assert.equal(a.relY, b.relY);
});
