'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricLocNormalized } from '../../tools/salad-score/metrics/metric_loc_normalized.mjs';

test('contract: a one-line helper does not score a lower normalized LOC than its readable equivalent', () => {
  const oneLine = "_setStatus(el, text, bg) { el.textContent = text; el.style.cssText = bg; }";
  const readable = "_setStatus(el, text, bg) {\n  el.textContent = text;\n  el.style.cssText = bg;\n}";
  const oneLineResult = metricLocNormalized(oneLine).value;
  const readableResult = metricLocNormalized(readable).value;
  assert.equal(oneLineResult, readableResult);
});

test('normalizedLoc equals physical lines when statements and lines already match 1:1', () => {
  const src = 'const a = 1;\nconst b = 2;\nconst c = 3;';
  assert.equal(metricLocNormalized(src).value, 3);
});

test('normalizedLoc never drops below the logical statement count even when heavily fused', () => {
  const fused = 'a(); b(); c(); d(); e(); f(); g();';
  assert.equal(metricLocNormalized(fused).value, 7);
});

test('normalizedLoc reflects real physical growth (blank lines), but the logical floor never drops', () => {
  const compact = 'a();\nb();';
  const decorated = 'a();\n\n\n\nb();';
  assert.equal(metricLocNormalized(compact).value, 2);
  assert.ok(metricLocNormalized(decorated).value >= metricLocNormalized(compact).value);
});
