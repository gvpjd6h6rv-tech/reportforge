'use strict';
/**
 * 1 responsibility: verify that every Oleada-1 legacy/modular pair is
 * equivalent on the live repo. This is the definitive equivalence gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runGuards } from '../../tools/runners/run_guards.mjs';

// Oleada 1 legacy guards mapped in compare_results.mjs
const OLEADA_1_LEGACY = [
  'immutability-guard',
  'load-order-guard',
  'shared-core-guard',
  'subsystem-ownership-guard',
];

test('dual mode — all Oleada 1 pairs are equivalent (legacy == modular)', async () => {
  const r = await runGuards({ mode: 'dual' });

  const divergent = r.comparisons
    .filter(c => OLEADA_1_LEGACY.includes(c.legacyId))
    .filter(c => !c.equivalent);

  if (divergent.length > 0) {
    for (const d of divergent) {
      console.error(`  DIVERGENCE: ${d.legacyId}`);
      console.error(`    legacy=${d.legacyPass}  modular=${d.modularPass}`);
      console.error(`    detail: ${d.divergence?.detail}`);
    }
  }

  assert.equal(divergent.length, 0, `${divergent.length} divergent pair(s) found`);
});

test('dual mode — all Oleada 1 modular guards pass', async () => {
  const r = await runGuards({ mode: 'dual' });
  const fails = r.modularResults.filter(x => !x.modularResult);
  assert.equal(fails.length, 0, `failing: ${fails.map(f => f.guard).join(', ')}`);
});
