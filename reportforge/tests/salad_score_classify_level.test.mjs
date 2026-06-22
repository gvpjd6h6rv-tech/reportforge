'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLevel } from '../../tools/salad-score/scoring/classify_level.mjs';

const SCALE = [
  { level: 'limpio', min: 0, max: 20 },
  { level: 'aceptable', min: 21, max: 40 },
  { level: 'sospechoso', min: 41, max: 60 },
  { level: 'ensalada_seria', min: 61, max: 80 },
  { level: 'ensalada_nivel_dios', min: 81, max: 100 },
];

test('classifyLevel — maps each boundary of the mandatory scale correctly', () => {
  assert.equal(classifyLevel(0, SCALE), 'limpio');
  assert.equal(classifyLevel(20, SCALE), 'limpio');
  assert.equal(classifyLevel(21, SCALE), 'aceptable');
  assert.equal(classifyLevel(60, SCALE), 'sospechoso');
  assert.equal(classifyLevel(61, SCALE), 'ensalada_seria');
  assert.equal(classifyLevel(81, SCALE), 'ensalada_nivel_dios');
  assert.equal(classifyLevel(100, SCALE), 'ensalada_nivel_dios');
});
