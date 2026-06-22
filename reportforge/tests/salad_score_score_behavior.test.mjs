'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreBehavior } from '../../tools/salad-score/scoring/score_behavior.mjs';

test('scoreBehavior — a true boolean signal contributes 100 * its weight', () => {
  const signals = { ownershipViolation: true, roleViolation: false, crossLayerDependency: false, hiddenSideEffect: false, coupling: 0 };
  const weights = { ownershipViolation: 0.5, roleViolation: 0.5 };
  assert.equal(scoreBehavior(signals, weights, {}), 50);
});

test('scoreBehavior — a numeric signal (coupling) is capped-normalized like a metric', () => {
  const signals = { coupling: 5 };
  const weights = { coupling: 1 };
  assert.equal(scoreBehavior(signals, weights, { coupling: 10 }), 50);
});
