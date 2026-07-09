'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoResponsibilityMerge } from '../../tools/salad-score/checkers/check_no_responsibility_merge.mjs';

test('contract: a *Map.js file with fetch fails', () => {
  const result = checkNoResponsibilityMerge('engines/FooMap.js', "const x = fetch('/api');");
  assert.equal(result.value, false);
  assert.match(result.evidence[0], /io/);
});

test('contract: a *Map.js file with DOM mutation fails', () => {
  const result = checkNoResponsibilityMerge('engines/FooMap.js', 'document.getElementById("x");');
  assert.equal(result.value, false);
  assert.match(result.evidence[0], /dom-mutation/);
});

test('contract: a *Map.js file with event wiring fails', () => {
  const result = checkNoResponsibilityMerge('engines/FooMap.js', "el.addEventListener('click', fn);");
  assert.equal(result.value, false);
  assert.match(result.evidence[0], /event-wiring/);
});

test('contract: a pure *Map.js data-transform file passes', () => {
  const src = "const FooMap = { build(x) { return { label: x.name, path: x.id }; } };";
  const result = checkNoResponsibilityMerge('engines/FooMap.js', src);
  assert.equal(result.value, true);
  assert.deepEqual(result.evidence, []);
});

test('a non-Map.js file is never checked by this rule (out of scope by filename)', () => {
  const result = checkNoResponsibilityMerge('engines/FooOrchestrator.js', "fetch('/api'); document.getElementById('x');");
  assert.equal(result.value, true);
});
