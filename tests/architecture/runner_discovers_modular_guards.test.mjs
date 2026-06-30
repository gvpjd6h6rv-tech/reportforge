'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectModularGuards } from '../../tools/collectors/collect_modular_guards.mjs';

const FIXTURE_MAP = {
  entries: [
    { id:'g1', layer:'guard', state:'existing', pathCurrent:'tools/guards/x/g1.mjs' },
    { id:'g2', layer:'guard', state:'planned',  pathCurrent:null },
    { id:'g3', layer:'checker', state:'existing', pathCurrent:'tools/salad-score/checkers/c.mjs' },
    { id:'g4', layer:'guard', state:'existing', pathCurrent:'audit/g4_guard.mjs' },
    { id:'g5', layer:'guard', state:'existing', pathCurrent:'tools/guards/y/g5.mjs' },
  ],
};

test('collectModularGuards — returns only tools/guards/ existing guards', () => {
  const guards = collectModularGuards(FIXTURE_MAP);
  assert.deepEqual(guards.map(g => g.id), ['g1', 'g5']);
});

test('collectModularGuards — excludes planned and non-guard layers', () => {
  const guards = collectModularGuards(FIXTURE_MAP);
  assert.ok(guards.every(g => g.layer === 'guard' && g.state === 'existing'));
});

test('collectModularGuards — excludes audit/ legacy guards', () => {
  const guards = collectModularGuards(FIXTURE_MAP);
  assert.ok(guards.every(g => g.pathCurrent.startsWith('tools/guards/')));
});
