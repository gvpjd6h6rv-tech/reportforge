'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareResults } from '../../tools/comparators/compare_results.mjs';

const mkResult = (id, pass, mode) => ({ id, pass, mode, owner:'test', evidence:[] });

test('compareResults — flags divergence when legacy passes but modular fails', () => {
  const results = [
    mkResult('immutability-guard', true, 'legacy'),
    mkResult('immutability-history-private', false, 'modular'),
    mkResult('immutability-history-no-expose', true, 'modular'),
  ];
  const comps = compareResults(results);
  const c = comps.find(x => x.legacyId === 'immutability-guard');
  assert.ok(c, 'comparison entry must exist');
  assert.equal(c.equivalent, false);
  assert.ok(c.divergence !== null);
});

test('compareResults — marks equivalent when both sides agree on pass', () => {
  const results = [
    mkResult('immutability-guard', true, 'legacy'),
    mkResult('immutability-history-private', true, 'modular'),
    mkResult('immutability-history-no-expose', true, 'modular'),
  ];
  const comps = compareResults(results);
  const c = comps.find(x => x.legacyId === 'immutability-guard');
  assert.equal(c.equivalent, true);
  assert.equal(c.divergence, null);
});

test('compareResults — marks equivalent when both sides agree on fail', () => {
  const results = [
    mkResult('immutability-guard', false, 'legacy'),
    mkResult('immutability-history-private', false, 'modular'),
    mkResult('immutability-history-no-expose', false, 'modular'),
  ];
  const comps = compareResults(results);
  const c = comps.find(x => x.legacyId === 'immutability-guard');
  assert.equal(c.equivalent, true);
});

test('compareResults — does not include pair when legacy guard absent from run', () => {
  const results = [
    mkResult('immutability-history-private', true, 'modular'),
  ];
  const comps = compareResults(results);
  assert.equal(comps.filter(c => c.legacyId === 'immutability-guard').length, 0);
});
