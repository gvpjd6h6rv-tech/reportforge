'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricLocNormalized } from '../../tools/salad-score/metrics/metric_loc_normalized.mjs';
import { countLogicalStatements } from '../../audit/architecture/count_logical_statements.mjs';

// Real scenario from this repo's own history (UDS 4.1 Fase 17):
// SqlCommandEditor.js repeated a 2-line status-badge pattern 5 times.
// Extracting it into a readable helper is genuine duplication removal,
// not cosmetic compaction — this must not be penalized relative to the
// duplicated original.
const DUPLICATED = `
statusEl.textContent = 'Consultando…';
statusEl.style.cssText = 'background:#666;';
statusEl.textContent = '⚠ Error de red';
statusEl.style.cssText = 'background:#7D1F1F;';
statusEl.textContent = '⚠ Inválido';
statusEl.style.cssText = 'background:#7D1F1F;';
statusEl.textContent = '⚠ Bloqueado';
statusEl.style.cssText = 'background:#7D1F1F;';
statusEl.textContent = '✓ OK';
statusEl.style.cssText = 'background:#1E5F4A;';
`.trim();

const DEDUPED = `
_setStatus(el, text, bg) {
  el.textContent = text;
  el.style.cssText = bg;
}
_setStatus(statusEl, 'Consultando…', 'background:#666;');
_setStatus(statusEl, '⚠ Error de red', 'background:#7D1F1F;');
_setStatus(statusEl, '⚠ Inválido', 'background:#7D1F1F;');
_setStatus(statusEl, '⚠ Bloqueado', 'background:#7D1F1F;');
_setStatus(statusEl, '✓ OK', 'background:#1E5F4A;');
`.trim();

test('extracting a real duplicated pattern into a readable helper does not score worse (higher) than the duplicated original', () => {
  const duplicatedLoc = metricLocNormalized(DUPLICATED).value;
  const dedupedLoc = metricLocNormalized(DEDUPED).value;
  assert.ok(dedupedLoc <= duplicatedLoc, `deduped (${dedupedLoc}) should not exceed duplicated (${duplicatedLoc})`);
});

test('the deduped version has fewer logical statements than the duplicated original (real reduction, not cosmetic)', () => {
  assert.ok(countLogicalStatements(DEDUPED) < countLogicalStatements(DUPLICATED));
});
