'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoCrossLayerImports } from '../../tools/salad-score/checkers/check_no_cross_layer_imports.mjs';

test('checkNoCrossLayerImports — fails when a metric imports from a checker (higher layer)', () => {
  const text = "import {a} from '../checkers/check_no_god_file.mjs';";
  assert.equal(checkNoCrossLayerImports('tools/salad-score/metrics/metric_x.mjs', text).value, false);
});

test('checkNoCrossLayerImports — passes when a checker imports from a metric (lower layer)', () => {
  const text = "import {a} from '../metrics/metric_loc.mjs';";
  assert.equal(checkNoCrossLayerImports('tools/salad-score/checkers/check_x.mjs', text).value, true);
});
