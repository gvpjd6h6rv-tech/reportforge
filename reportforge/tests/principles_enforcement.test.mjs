'use strict';
/**
 * principles_enforcement.test.mjs — CI gate for the 80 engineering principles
 *
 * Validates the structural integrity of principles_matrix.json.
 * These tests break CI on matrix corruption — they do NOT replace the
 * per-principle source tests; they enforce that the matrix itself stays honest.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MATRIX_PATH = path.join(ROOT, 'audit/principles_matrix.json');

const VALID_SEVERITIES = new Set(['critical', 'strong', 'important']);
const VALID_STATUSES   = new Set(['draft', 'documented', 'executable', 'hard-enforced']);
const VALID_GROUPS     = new Set(['base', 'hardening', 'extra']);

let matrix;
try {
  matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
} catch (e) {
  throw new Error(`Cannot load principles_matrix.json: ${e.message}`);
}

// ---------------------------------------------------------------------------
// 1. Structural completeness
// ---------------------------------------------------------------------------

test('principles — matrix has exactly 80 entries', () => {
  assert.equal(matrix.length, 80,
    `matrix must have 80 entries, found ${matrix.length}`);
});

test('principles — IDs are exactly 1..80 without gaps or duplicates', () => {
  const ids = matrix.map((p) => p.id).sort((a, b) => a - b);
  const expected = Array.from({ length: 80 }, (_, i) => i + 1);

  const missing   = expected.filter((id) => !ids.includes(id));
  const duplicate = ids.filter((id, i) => ids.indexOf(id) !== i);
  const outRange  = ids.filter((id) => id < 1 || id > 80);

  assert.equal(missing.length, 0,   `missing IDs: ${missing.join(', ')}`);
  assert.equal(duplicate.length, 0, `duplicate IDs: ${duplicate.join(', ')}`);
  assert.equal(outRange.length, 0,  `out-of-range IDs: ${outRange.join(', ')}`);
});

test('principles — all entries have valid severity values', () => {
  const bad = matrix.filter((p) => !VALID_SEVERITIES.has(p.severity));
  assert.equal(bad.length, 0,
    `invalid severities: ${bad.map((p) => `#${p.id}=${p.severity}`).join(', ')}`);
});

test('principles — all entries have valid status values', () => {
  const bad = matrix.filter((p) => !VALID_STATUSES.has(p.status));
  assert.equal(bad.length, 0,
    `invalid statuses: ${bad.map((p) => `#${p.id}=${p.status}`).join(', ')}`);
});

test('principles — all entries have valid group values', () => {
  const bad = matrix.filter((p) => !VALID_GROUPS.has(p.group));
  assert.equal(bad.length, 0,
    `invalid groups: ${bad.map((p) => `#${p.id}=${p.group}`).join(', ')}`);
});

// ---------------------------------------------------------------------------
// 2. Severity rules
// ---------------------------------------------------------------------------

test('principles — no critical principle is in draft status', () => {
  const violations = matrix.filter(
    (p) => p.severity === 'critical' && p.status === 'draft',
  );
  assert.equal(violations.length, 0,
    `critical principles must not be draft:\n${violations.map((p) => `  #${p.id} "${p.name}"`).join('\n')}`);
});

test('principles — all critical and strong principles have a non-empty owner', () => {
  const violations = matrix.filter(
    (p) => (p.severity === 'critical' || p.severity === 'strong') &&
            (!p.owner || p.owner.trim() === ''),
  );
  assert.equal(violations.length, 0,
    `critical/strong without owner:\n${violations.map((p) => `  #${p.id} "${p.name}"`).join('\n')}`);
});

// ---------------------------------------------------------------------------
// 3. Status rules
// ---------------------------------------------------------------------------

test('principles — all executable/hard-enforced entries have source_files', () => {
  const violations = matrix.filter(
    (p) => (p.status === 'executable' || p.status === 'hard-enforced') &&
            (!Array.isArray(p.source_files) || p.source_files.length === 0),
  );
  assert.equal(violations.length, 0,
    `executable/hard-enforced without source_files:\n${violations.map((p) => `  #${p.id} "${p.name}"`).join('\n')}`);
});

test('principles — all executable/hard-enforced entries have evidence', () => {
  const violations = matrix.filter(
    (p) => (p.status === 'executable' || p.status === 'hard-enforced') &&
            (!Array.isArray(p.evidence) || p.evidence.length === 0 ||
             p.evidence.every((e) => !String(e).trim())),
  );
  assert.equal(violations.length, 0,
    `executable/hard-enforced without evidence:\n${violations.map((p) => `  #${p.id} "${p.name}"`).join('\n')}`);
});

test('principles — all hard-enforced entries have ci_gate=true', () => {
  const violations = matrix.filter(
    (p) => p.status === 'hard-enforced' && p.ci_gate !== true,
  );
  assert.equal(violations.length, 0,
    `hard-enforced without ci_gate:\n${violations.map((p) => `  #${p.id} "${p.name}"`).join('\n')}`);
});

// ---------------------------------------------------------------------------
// 4. Source and test file existence (executable + hard-enforced)
// ---------------------------------------------------------------------------

test('principles — source_files declared in executable/hard-enforced entries exist on disk', () => {
  const missing = [];
  for (const p of matrix) {
    if (p.status !== 'executable' && p.status !== 'hard-enforced') continue;
    for (const f of (p.source_files || [])) {
      if (f.endsWith('/')) continue; // directory reference — skip
      if (!fs.existsSync(path.join(ROOT, f))) {
        missing.push(`#${p.id} "${p.name}": ${f}`);
      }
    }
  }
  assert.equal(missing.length, 0,
    `source_files not found on disk:\n${missing.map((m) => `  ${m}`).join('\n')}`);
});

test('principles — test_files declared in hard-enforced entries exist on disk', () => {
  const missing = [];
  for (const p of matrix) {
    if (p.status !== 'hard-enforced') continue;
    for (const f of (p.test_files || [])) {
      if (!fs.existsSync(path.join(ROOT, f))) {
        missing.push(`#${p.id} "${p.name}": ${f}`);
      }
    }
  }
  assert.equal(missing.length, 0,
    `test_files not found on disk:\n${missing.map((m) => `  ${m}`).join('\n')}`);
});

// ---------------------------------------------------------------------------
// 5. Specific high-priority principles (#72, #77, #80, #33, #35, #37)
// ---------------------------------------------------------------------------

function getById(id) {
  const p = matrix.find((e) => e.id === id);
  assert.ok(p, `principle #${id} not found in matrix`);
  return p;
}

test('principles — #72 Fix Scope Discipline is at least executable with source_files', () => {
  const p = getById(72);
  assert.ok(
    p.status === 'executable' || p.status === 'hard-enforced',
    `#72 must be executable or hard-enforced, is "${p.status}"`,
  );
  assert.ok(Array.isArray(p.source_files) && p.source_files.length > 0,
    '#72 must have source_files');
});

test('principles — #77 Cause over Cosmetic Fixes is critical with evidence', () => {
  const p = getById(77);
  assert.equal(p.severity, 'critical', '#77 must be critical severity');
  assert.ok(Array.isArray(p.evidence) && p.evidence.length > 0,
    '#77 must have evidence entries');
});

test('principles — #80 Every Pain Becomes a Guardrail references principles_enforcement.test.mjs', () => {
  const p = getById(80);
  assert.ok(
    (p.test_files || []).some((f) => f.includes('principles_enforcement')),
    '#80 must reference principles_enforcement.test.mjs as a test_file',
  );
});

test('principles — #33 Contract Tests is hard-enforced with ci_gate', () => {
  const p = getById(33);
  assert.equal(p.status, 'hard-enforced', '#33 must be hard-enforced');
  assert.equal(p.ci_gate, true, '#33 must have ci_gate=true');
});

test('principles — #35 Regression Tests is hard-enforced with ci_gate', () => {
  const p = getById(35);
  assert.equal(p.status, 'hard-enforced', '#35 must be hard-enforced');
  assert.equal(p.ci_gate, true, '#35 must have ci_gate=true');
});

test('principles — #37 Layout Tests is hard-enforced with ci_gate', () => {
  const p = getById(37);
  assert.equal(p.status, 'hard-enforced', '#37 must be hard-enforced');
  assert.equal(p.ci_gate, true, '#37 must have ci_gate=true');
});

// ---------------------------------------------------------------------------
// 6. Gap integrity — gaps must be honest strings (not false positives)
// ---------------------------------------------------------------------------

test('principles — no hard-enforced entry claims a gap that contradicts its status', () => {
  // A hard-enforced entry may have a gap (e.g. DEFERRED for a specific sub-case)
  // but must not claim the entire principle is unimplemented
  // Match only phrases that claim the principle itself is wholly unimplemented.
  // Gaps about historical debt or partial sub-cases are allowed.
  const suspicious = matrix.filter(
    (p) => p.status === 'hard-enforced' &&
            typeof p.gap === 'string' &&
            /\bno enforcement\b|\bnot implemented\b|\bno ci.?gate\b|\bno test.*implemented\b/i.test(p.gap),
  );
  assert.equal(suspicious.length, 0,
    `hard-enforced entries with suspicious gap text:\n${suspicious.map((p) => `  #${p.id} "${p.name}": ${p.gap}`).join('\n')}`);
});

// ---------------------------------------------------------------------------
// 7. Informational summary (always passes)
// ---------------------------------------------------------------------------

test('principles — informational: status distribution', (t) => {
  const counts = {};
  for (const p of matrix) counts[p.status] = (counts[p.status] || 0) + 1;
  const lines = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  t.diagnostic(`status distribution — ${lines}`);

  const hardCount = counts['hard-enforced'] || 0;
  t.diagnostic(`enforcement coverage: ${hardCount}/80 hard-enforced (${Math.round(hardCount / 80 * 100)}%)`);

  const criticalNotHard = matrix.filter(
    (p) => p.severity === 'critical' && p.status !== 'hard-enforced',
  );
  if (criticalNotHard.length > 0) {
    t.diagnostic(`critical principles not yet hard-enforced: ${criticalNotHard.map((p) => `#${p.id}`).join(', ')}`);
  }
});
