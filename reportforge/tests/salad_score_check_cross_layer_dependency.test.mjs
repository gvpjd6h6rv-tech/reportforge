'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCrossLayerDependency } from '../../tools/salad-score/checkers/check_cross_layer_dependency.mjs';

test('checkCrossLayerDependency — true when an import target is in neither own files nor shared files', () => {
  assert.equal(checkCrossLayerDependency(['Other.js'], ['Self.js'], ['Shared.js']).value, true);
});

test('checkCrossLayerDependency — false when every import target is own or shared', () => {
  assert.equal(checkCrossLayerDependency(['Self.js', 'Shared.js'], ['Self.js'], ['Shared.js']).value, false);
});

test('checkCrossLayerDependency — false with empty allow-lists and empty imports (v1 safe default)', () => {
  assert.equal(checkCrossLayerDependency([], [], []).value, false);
});
