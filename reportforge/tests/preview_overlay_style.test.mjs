// RF-PREVIEW-BBOX-HUG-1 — hover & selection share one outline formula in
// Preview; Design selection keeps its border (control/regression).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { overlayBoxStyle } = require('../../engines/PreviewOverlayStyle.js');

test('PREVIEW: hugs outer edge with outline, no border (same as hover)', () => {
  const s = overlayBoxStyle(true, '#0066CC');
  assert.equal(s.border, 'none');
  assert.equal(s.outline, '1px solid #0066CC');
  assert.equal(s.outlineOffset, '0px');
});

test('DESIGN unchanged: selection still uses border, no outline', () => {
  const s = overlayBoxStyle(false, '#0066CC');
  assert.equal(s.border, '1px solid #0066CC');
  assert.equal(s.outline, 'none');
});

test('hover and selection get the IDENTICAL formula in preview (only color differs)', () => {
  const sel = overlayBoxStyle(true, 'var(--cr-sel-bdr, #0066CC)');
  const hov = overlayBoxStyle(true, '#F08000');
  assert.equal(sel.border, hov.border);           // both 'none'
  assert.equal(sel.outlineOffset, hov.outlineOffset);
  assert.equal(sel.outline, '1px solid var(--cr-sel-bdr, #0066CC)');
  assert.equal(hov.outline, '1px solid #F08000');
});
