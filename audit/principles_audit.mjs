#!/usr/bin/env node
'use strict';
/**
 * principles_audit.mjs — CI gate for principles_matrix.json
 *
 * Fails (exit 1) if:
 *   - IDs are not exactly 1..80 without gaps
 *   - Any critical principle is in draft status
 *   - Any critical or strong principle has no owner
 *   - Any executable or hard-enforced principle has no source_files
 *   - Any executable or hard-enforced principle has no evidence
 *   - Any hard-enforced principle has ci_gate !== true
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX_PATH = path.join(ROOT, 'audit/principles_matrix.json');

const VALID_SEVERITIES = new Set(['critical', 'strong', 'important']);
const VALID_STATUSES   = new Set(['draft', 'documented', 'executable', 'hard-enforced']);
const VALID_GROUPS     = new Set(['base', 'hardening', 'extra']);

let failures = 0;
let warnings = 0;

function fail(msg) {
  console.error(`❌ FAIL  ${msg}`);
  failures++;
}

function warn(msg) {
  console.warn(`⚠️  WARN  ${msg}`);
  warnings++;
}

function pass(msg) {
  console.log(`✅ PASS  ${msg}`);
}

// ── Load ─────────────────────────────────────────────────────────────────────

let matrix;
try {
  matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
} catch (e) {
  fail(`cannot read or parse ${MATRIX_PATH}: ${e.message}`);
  process.exit(1);
}

// ── Rule 1: exactly 80 entries ───────────────────────────────────────────────

if (matrix.length !== 80) {
  fail(`matrix must have exactly 80 entries, found ${matrix.length}`);
} else {
  pass(`matrix has exactly 80 entries`);
}

// ── Rule 2: IDs are 1..80 without gaps ───────────────────────────────────────

const ids = matrix.map((p) => p.id).sort((a, b) => a - b);
const expectedIds = Array.from({ length: 80 }, (_, i) => i + 1);
const missingIds  = expectedIds.filter((id) => !ids.includes(id));
const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
const outOfRange   = ids.filter((id) => id < 1 || id > 80);

if (missingIds.length > 0)  fail(`missing IDs: ${missingIds.join(', ')}`);
if (duplicateIds.length > 0) fail(`duplicate IDs: ${duplicateIds.join(', ')}`);
if (outOfRange.length > 0)   fail(`out-of-range IDs: ${outOfRange.join(', ')}`);
if (missingIds.length === 0 && duplicateIds.length === 0 && outOfRange.length === 0) {
  pass(`IDs are exactly 1..80 without gaps or duplicates`);
}

// ── Per-entry validation ──────────────────────────────────────────────────────

for (const p of matrix) {
  const ref = `#${p.id} "${p.name}"`;

  // Schema completeness
  if (!VALID_SEVERITIES.has(p.severity)) fail(`${ref}: invalid severity "${p.severity}"`);
  if (!VALID_STATUSES.has(p.status))     fail(`${ref}: invalid status "${p.status}"`);
  if (!VALID_GROUPS.has(p.group))        fail(`${ref}: invalid group "${p.group}"`);

  // Rule 3: critical → not draft
  if (p.severity === 'critical' && p.status === 'draft') {
    fail(`${ref}: critical principle must not be in draft status`);
  }

  // Rule 4: critical/strong → must have owner
  if ((p.severity === 'critical' || p.severity === 'strong') && (!p.owner || p.owner.trim() === '')) {
    fail(`${ref}: critical/strong principle must have a non-empty owner`);
  }

  // Rule 5: executable/hard-enforced → must have source_files
  if ((p.status === 'executable' || p.status === 'hard-enforced') &&
      (!Array.isArray(p.source_files) || p.source_files.length === 0)) {
    fail(`${ref}: status="${p.status}" requires at least one source_file`);
  }

  // Rule 6: executable/hard-enforced → must have evidence
  if ((p.status === 'executable' || p.status === 'hard-enforced') &&
      (!Array.isArray(p.evidence) || p.evidence.length === 0 || p.evidence.every((e) => !e.trim()))) {
    fail(`${ref}: status="${p.status}" requires at least one evidence entry`);
  }

  // Rule 7: hard-enforced → ci_gate must be true
  if (p.status === 'hard-enforced' && p.ci_gate !== true) {
    fail(`${ref}: hard-enforced principle must have ci_gate=true`);
  }

  // Soft warnings
  if (p.status === 'hard-enforced' && (!Array.isArray(p.test_files) || p.test_files.length === 0)) {
    warn(`${ref}: hard-enforced but no test_files listed`);
  }

  if (p.severity === 'critical' && p.status === 'documented') {
    warn(`${ref}: critical principle is only "documented" — consider executable or hard-enforced`);
  }

  // Verify source_files exist on disk (for executable/hard-enforced)
  if (p.status === 'executable' || p.status === 'hard-enforced') {
    for (const f of (p.source_files || [])) {
      // Skip directory references (ends with /)
      if (f.endsWith('/')) continue;
      const full = path.join(ROOT, f);
      if (!fs.existsSync(full)) {
        fail(`${ref}: source_file not found on disk: ${f}`);
      }
    }
    for (const f of (p.test_files || [])) {
      const full = path.join(ROOT, f);
      if (!fs.existsSync(full)) {
        fail(`${ref}: test_file not found on disk: ${f}`);
      }
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const byStatus = {};
const bySeverity = {};
for (const p of matrix) {
  byStatus[p.status]     = (byStatus[p.status] || 0) + 1;
  bySeverity[p.severity] = (bySeverity[p.severity] || 0) + 1;
}

console.log('\n── Status breakdown ─────────────────────────────────────────');
for (const [k, v] of Object.entries(byStatus).sort()) console.log(`   ${k.padEnd(16)} ${v}`);

console.log('\n── Severity breakdown ───────────────────────────────────────');
for (const [k, v] of Object.entries(bySeverity).sort()) console.log(`   ${k.padEnd(16)} ${v}`);

const hardEnforced = matrix.filter((p) => p.status === 'hard-enforced').length;
const criticalDraft = matrix.filter((p) => p.severity === 'critical' && p.status === 'draft').length;
const criticalDocOnly = matrix.filter((p) => p.severity === 'critical' && p.status === 'documented').length;

console.log(`\n── Key metrics ──────────────────────────────────────────────`);
console.log(`   hard-enforced:      ${hardEnforced}/80`);
console.log(`   critical in draft:  ${criticalDraft}  (must be 0)`);
console.log(`   critical doc-only:  ${criticalDocOnly} (soft warning)`);
console.log(`   audit failures:     ${failures}`);
console.log(`   audit warnings:     ${warnings}`);

if (failures > 0) {
  console.error(`\n❌ principles_audit FAILED — ${failures} violation(s)\n`);
  process.exit(1);
} else {
  console.log(`\n✅ principles_audit PASSED — all rules satisfied\n`);
  process.exit(0);
}
