'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runGuards } from '../../tools/runners/run_guards.mjs';

test('runGuards modular mode — returns results only for modular guards', async () => {
  const r = await runGuards({ mode: 'modular' });
  assert.ok(r.modularResults.length > 0, 'must have modular results');
  assert.equal(r.legacyResults.length, 0, 'must have no legacy results in modular mode');
  assert.equal(r.comparisons.length, 0);
});

test('runGuards modular mode — all Oleada 1 guards pass', async () => {
  const r = await runGuards({ mode: 'modular' });
  const fails = r.modularResults.filter(x => !x.modularResult);
  assert.equal(fails.length, 0, `failing guards: ${fails.map(f=>f.guard).join(', ')}`);
});

test('runGuards dual mode — returns both modular and legacy results', async () => {
  const r = await runGuards({ mode: 'dual' });
  assert.ok(r.modularResults.length > 0);
  assert.ok(r.legacyResults.length > 0);
  assert.ok(r.comparisons.length > 0);
});
