#!/usr/bin/env node
'use strict';
/**
 * shared_core_guard.mjs — Principle #76 Shared Core Standards
 *
 * Verifies that the minimum test surface required by every RF deployment is
 * documented in testing-canon.md and that the key test files referenced
 * actually exist in the repository.
 *
 * RULE-A (SHARED-DOC-001): testing-canon.md must contain a Shared Core
 *   Standards section listing the minimum test surface that any RF deployment
 *   or fork must maintain.
 *
 * RULE-B (SHARED-SUITES-001): The four canonical test suites named in the
 *   Shared Core Standards must exist as files in the repository:
 *   - reportforge/tests/debuggability.test.mjs
 *   - reportforge/tests/governance_guardrails.test.mjs
 *   - reportforge/tests/engine_contracts.test.mjs
 *   - reportforge/tests/race_conditions.test.mjs
 *
 * RULE-C (SHARED-VALIDATE-001): validate_repo.sh must exist — it is the
 *   single entry point for full repo validation and is the first item in the
 *   Shared Core Standards.
 *
 * RULE-D (SHARED-GUARDS-001): The audit/ directory must contain at least
 *   one .mjs guard file — the Shared Core Standards require all guards to
 *   exit 0, so they must exist.
 *
 * RULE-E (SHARED-ENFORCEMENT-001): testing-canon.md must reference this
 *   guard (shared_core_guard) in its Enforcement section so the shared
 *   standard cannot be silently removed.
 *
 * Usage:
 *   node audit/shared_core_guard.mjs          # fail on violations
 *   node audit/shared_core_guard.mjs --report # report only
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

// ── RULE-A: Shared Core Standards section documented ─────────────────────────

check('SHARED-DOC-001', 'docs/architecture/testing-canon.md',
  /Shared Core Standards/.test(canonDoc),
  'testing-canon.md must contain a "Shared Core Standards" section defining the minimum test surface');

check('SHARED-DOC-001', 'docs/architecture/testing-canon.md',
  /validate_repo\.sh/.test(canonDoc),
  'Shared Core Standards must list validate_repo.sh as the entry point for full repo validation');

// ── RULE-B: Canonical test suite files exist ──────────────────────────────────

const REQUIRED_SUITES = [
  'reportforge/tests/debuggability.test.mjs',
  'reportforge/tests/governance_guardrails.test.mjs',
  'reportforge/tests/engine_contracts.test.mjs',
  'reportforge/tests/race_conditions.test.mjs',
];

for (const suite of REQUIRED_SUITES) {
  check('SHARED-SUITES-001', suite,
    fs.existsSync(path.join(ROOT, suite)),
    `Shared Core Standard suite must exist: ${suite}`);

  check('SHARED-SUITES-001', 'docs/architecture/testing-canon.md',
    canonDoc.includes(suite) || canonDoc.includes(path.basename(suite, '.mjs')),
    `testing-canon.md Shared Core Standards must reference ${suite}`);
}

// ── RULE-C: validate_repo.sh exists ──────────────────────────────────────────

check('SHARED-VALIDATE-001', 'validate_repo.sh',
  fs.existsSync(path.join(ROOT, 'validate_repo.sh')),
  'validate_repo.sh must exist — it is the canonical entry point for full repo validation');

// ── RULE-D: audit/ directory has guard files ──────────────────────────────────

const auditDir = path.join(ROOT, 'audit');
const guardFiles = fs.existsSync(auditDir)
  ? fs.readdirSync(auditDir).filter((f) => f.endsWith('.mjs'))
  : [];

check('SHARED-GUARDS-001', 'audit/*.mjs',
  guardFiles.length >= 5,
  `audit/ must contain ≥5 guard .mjs files (Shared Core Standards require all guards to pass) — found ${guardFiles.length}`);

// ── RULE-E: Guard referenced in Enforcement section ──────────────────────────

check('SHARED-ENFORCEMENT-001', 'docs/architecture/testing-canon.md',
  /shared_core_guard/.test(canonDoc),
  'testing-canon.md Enforcement section must reference shared_core_guard.mjs so the standard cannot be silently removed');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Shared Core Guard (#76) ───────────────────────────────────────');
console.log(`   audit guards found: ${guardFiles.length}`);
console.log(`   violations found:   ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ shared core standards documented — canonical suites exist and referenced\n');
  process.exit(0);
}

console.error('\n❌ shared core gap — minimum test surface not fully documented or missing files');
console.error('   Fix: add Shared Core Standards section to testing-canon.md; ensure all suite files exist\n');
if (!REPORT) process.exit(1);
