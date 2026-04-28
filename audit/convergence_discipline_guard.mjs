#!/usr/bin/env node
'use strict';
/**
 * convergence_discipline_guard.mjs — Principle #79 Three-Attempt Convergence
 *
 * Verifies that the operational discipline around fix convergence is documented
 * and that the machine-enforceable proxies are present.
 *
 * The three-attempt rule itself is a workflow heuristic and cannot be directly
 * tested in CI. What CAN be enforced statically:
 *
 * RULE-A (CONV-DOC-001): testing-canon.md must contain the Three-Attempt
 *   Convergence rule. If the rule is absent, the discipline is undefined and
 *   patch-on-patch accumulation is unchecked.
 *
 * RULE-B (CONV-DOC-001): testing-canon.md must state that fixes touching more
 *   than two files require architectural justification. This is the machine-
 *   checkable proxy for the three-attempt rule.
 *
 * RULE-C (CONV-GAP-001): Any principle in principles_matrix.json with
 *   status="documented" and ci_gate=false must have a non-empty "gap" field.
 *   An undocumented gap is a convergence failure: three attempts happened but
 *   the debt was not written down.
 *
 * RULE-D (CONV-CANON-001): The principles_matrix.json must contain no entry
 *   with both status="documented" and gap="" — silent documented-but-ungapped
 *   entries mean the convergence cycle was never closed.
 *
 * RULE-E (CONV-ENFORCEMENT-001): testing-canon.md must reference this guard
 *   (convergence_discipline_guard) in its Enforcement section, so the rule
 *   cannot be silently removed from the doc without breaking CI.
 *
 * Usage:
 *   node audit/convergence_discipline_guard.mjs          # fail on violations
 *   node audit/convergence_discipline_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS  = path.join(ROOT, 'docs', 'architecture');
const ARGS  = process.argv.slice(2);
const REPORT = ARGS.includes('--report');

const readDoc = (f) => {
  const p = path.join(DOCS, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

const canonDoc  = readDoc('testing-canon.md');
const matrixRaw = (() => {
  const p = path.join(ROOT, 'audit', 'principles_matrix.json');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '[]';
})();
const matrix = JSON.parse(matrixRaw);

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// RULE-A: three-attempt rule is in testing-canon.md.
check('CONV-DOC-001', 'docs/architecture/testing-canon.md',
  /Three-[Aa]ttempt|three.attempt/i.test(canonDoc),
  'testing-canon.md must contain the Three-Attempt Convergence rule');

check('CONV-DOC-001', 'docs/architecture/testing-canon.md',
  /First attempt|Second attempt|Third attempt/i.test(canonDoc),
  'testing-canon.md must enumerate the three attempt stages (First, Second, Third)');

// RULE-B: two-file constraint is stated.
check('CONV-DOC-001', 'docs/architecture/testing-canon.md',
  /two files|more than two/.test(canonDoc),
  'testing-canon.md must state the two-file constraint as the machine-enforceable proxy for the three-attempt rule');

// RULE-C + RULE-D: every documented-but-not-hard-enforced principle must have a gap.
const silentDocumented = matrix.filter(
  (p) => p.status === 'documented' && (!p.gap || p.gap.trim() === ''),
);

check('CONV-GAP-001', 'audit/principles_matrix.json',
  silentDocumented.length === 0,
  `${silentDocumented.length} principle(s) have status="documented" with no gap description: ` +
  silentDocumented.map((p) => `#${p.id} ${p.name}`).join(', ') +
  ' — convergence cycle not closed (gap must explain why it is not yet hard-enforced)');

// RULE-E: this guard is referenced in testing-canon.md Enforcement.
check('CONV-ENFORCEMENT-001', 'docs/architecture/testing-canon.md',
  /convergence_discipline_guard/.test(canonDoc),
  'testing-canon.md Enforcement section must reference convergence_discipline_guard.mjs so the rule cannot be silently removed');

// ── Summary of matrix coverage (informational) ───────────────────────────────

const total         = matrix.length;
const hardEnforced  = matrix.filter((p) => p.status === 'hard-enforced').length;
const executable    = matrix.filter((p) => p.status === 'executable').length;
const documented    = matrix.filter((p) => p.status === 'documented').length;
const withGap       = matrix.filter((p) => p.gap && p.gap.trim() !== '').length;

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Convergence Discipline Guard (#79) ───────────────────────────');
console.log(`   principles total:        ${total}`);
console.log(`   hard-enforced:           ${hardEnforced}`);
console.log(`   executable (partial):    ${executable}`);
console.log(`   documented only:         ${documented}`);
console.log(`   with documented gap:     ${withGap}`);
console.log(`   silent documented (#C):  ${silentDocumented.length}`);
console.log(`   violations found:        ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ convergence discipline intact — three-attempt rule documented, all gaps recorded\n');
  process.exit(0);
}

console.error('\n❌ convergence discipline gap — rule missing or undocumented debt exists');
console.error('   Fix: add gap descriptions to documented principles; keep three-attempt rule in testing-canon.md\n');
if (!REPORT) process.exit(1);
