#!/usr/bin/env node
'use strict';
/**
 * minimal_repro_guard.mjs — Principle #71 Minimal Repro First
 *
 * Verifies that the Minimal Repro First discipline is documented in
 * testing-canon.md and that this guard is self-referentially listed in the
 * Enforcement section so the rule cannot be silently removed.
 *
 * The three-step minimal repro protocol (strip to one section + one element,
 * verify reproduction, document context if it doesn't reproduce) is a
 * workflow convention and cannot be directly tested in CI. What CAN be
 * enforced statically:
 *
 * RULE-A (MINREPRO-DOC-001): testing-canon.md must contain the Minimal Repro
 *   First rule. If absent, the discipline is undefined and bugs may be fixed
 *   in full-document context without first isolating the root cause.
 *
 * RULE-B (MINREPRO-DOC-001): testing-canon.md must enumerate the three steps
 *   (strip/verify/document) so the protocol is unambiguous.
 *
 * RULE-C (MINREPRO-ENFORCEMENT-001): testing-canon.md must reference this
 *   guard (minimal_repro_guard) in its Enforcement section so the rule cannot
 *   be silently removed from the doc without breaking CI.
 *
 * Usage:
 *   node audit/minimal_repro_guard.mjs          # fail on violations
 *   node audit/minimal_repro_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS  = path.join(ROOT, 'docs', 'architecture');
const ARGS  = process.argv.slice(2);
const REPORT = ARGS.includes('--report');

const canonDoc = (() => {
  const p = path.join(DOCS, 'testing-canon.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
})();

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: Minimal Repro First rule is documented ───────────────────────────

check('MINREPRO-DOC-001', 'docs/architecture/testing-canon.md',
  /Minimal Repro First|Minimal.Repro/i.test(canonDoc),
  'testing-canon.md must contain the Minimal Repro First rule');

// ── RULE-B: Three-step protocol is enumerated ─────────────────────────────────

check('MINREPRO-DOC-001', 'docs/architecture/testing-canon.md',
  /Strip|strip.*section.*element/i.test(canonDoc),
  'testing-canon.md must describe the strip-to-minimum step of the minimal repro protocol');

check('MINREPRO-DOC-001', 'docs/architecture/testing-canon.md',
  /does not reproduce|not reproduce minimally/i.test(canonDoc),
  'testing-canon.md must describe what to do when the defect does not reproduce minimally (document context)');

// ── RULE-C: Guard is referenced in Enforcement section ───────────────────────

check('MINREPRO-ENFORCEMENT-001', 'docs/architecture/testing-canon.md',
  /minimal_repro_guard/.test(canonDoc),
  'testing-canon.md Enforcement section must reference minimal_repro_guard.mjs so the rule cannot be silently removed');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Minimal Repro Guard (#71) ─────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ minimal repro discipline documented — three-step protocol present in testing-canon\n');
  process.exit(0);
}

console.error('\n❌ minimal repro gap — protocol missing or not referenced in Enforcement');
console.error('   Fix: add Minimal Repro First section to testing-canon.md; reference this guard\n');
if (!REPORT) process.exit(1);
