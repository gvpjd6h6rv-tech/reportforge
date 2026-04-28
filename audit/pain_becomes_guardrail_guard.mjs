#!/usr/bin/env node
'use strict';
/**
 * pain_becomes_guardrail_guard.mjs — Principle #80 Every Pain Becomes a Guardrail
 *
 * A fix: commit must leave a guardrail. Three ways to satisfy the rule:
 *
 *   A. The commit includes a test file change (new or modified test)
 *      — the guardrail is in the same commit
 *
 *   B. The commit body references an existing guardrail:
 *      [guardrail: <test-file-or-principle-id>]
 *      e.g. [guardrail: geometry_core.test.mjs]
 *           [guardrail: #5]
 *      — proves the pain is already covered by an existing test
 *
 *   C. Explicit exemption markers:
 *      [fix-trivial]   — symlink, path, config (no logic changed, no guardrail needed)
 *      [visual-fix]    — presentation-only (already caught by #77 cosmetic guard)
 *      [arch]          — architecture cut (covered by #72 scope guard)
 *
 * VIOLATION: a fix: commit with NO test file, NO guardrail reference, NO exemption.
 *
 * Usage:
 *   node audit/pain_becomes_guardrail_guard.mjs              # check last commit
 *   node audit/pain_becomes_guardrail_guard.mjs --staged     # check staged
 *   node audit/pain_becomes_guardrail_guard.mjs --report     # report only, no exit 1
 *
 * Exit codes:
 *   0 — not a fix commit, or guardrail satisfied, or exempted
 *   1 — fix commit with no guardrail (and --report not set)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args   = process.argv.slice(2);
const STAGED = args.includes('--staged');
const REPORT = args.includes('--report');

// ── Patterns ──────────────────────────────────────────────────────────────────

const FIX_PREFIX = /^(fix|bugfix|hotfix|patch)(\([^)]+\))?:/i;

// Exemptions in commit body
const TRIVIAL_EXEMPT  = /\[(fix-trivial|visual-fix|cosmetic-ok|arch|arch-cut)\]/i;

// Guardrail reference: [guardrail: something]
const GUARDRAIL_REF   = /\[guardrail:\s*([^\]]+)\]/gi;

// Test file patterns (same as cosmetic guard)
const TEST_PATTERNS = [
  /^reportforge\/tests\/.*\.(py|mjs|js)$/,
  /\.test\.(mjs|js|py)$/,
  /test_.*\.py$/,
  /tanda\d+\.test\.mjs$/,
];

function isTest(f) { return TEST_PATTERNS.some((re) => re.test(f)); }

function run(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

// ── Load commit info ──────────────────────────────────────────────────────────

let changedFiles = [];
let commitMsg    = '';
let commitHash   = '';
let commitBody   = '';

if (STAGED) {
  changedFiles = run('git diff --cached --name-only').split('\n').filter(Boolean);
} else {
  changedFiles = run('git diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean);
  if (!changedFiles.length) changedFiles = run('git diff --name-only').split('\n').filter(Boolean);
  commitMsg  = run('git log -1 --format=%s');
  commitBody = run('git log -1 --format=%b');
  commitHash = run('git log -1 --format=%h');
}

const fullMessage = [commitMsg, commitBody].join('\n');

// ── Classify ──────────────────────────────────────────────────────────────────

const isFix     = FIX_PREFIX.test(commitMsg);
const isExempt  = TRIVIAL_EXEMPT.test(fullMessage);

const testFiles = changedFiles.filter(isTest);
const hasTest   = testFiles.length > 0;

// Extract guardrail references from commit body
const guardrailRefs = [];
let m;
const regex = /\[guardrail:\s*([^\]]+)\]/gi;
while ((m = regex.exec(fullMessage)) !== null) {
  guardrailRefs.push(m[1].trim());
}
const hasGuardrailRef = guardrailRefs.length > 0;

// Validate guardrail references that look like file paths exist on disk
const missingRefs = [];
for (const ref of guardrailRefs) {
  // Skip principle ID refs like #5, #72
  if (/^#\d+$/.test(ref)) continue;
  if (!fs.existsSync(path.join(ROOT, ref))) {
    missingRefs.push(ref);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('── Pain → Guardrail Guard (#80) ─────────────────────────────');
if (commitHash) console.log(`   commit:           ${commitHash}`);
console.log(`   mode:             ${STAGED ? 'staged' : 'last commit'}`);
console.log(`   is fix commit:    ${isFix}`);
console.log(`   exempt:           ${isExempt}`);
console.log(`   test files:       ${testFiles.length}  ${testFiles.length > 0 ? '← guardrail via test' : ''}`);
console.log(`   guardrail refs:   ${guardrailRefs.length}  ${guardrailRefs.length > 0 ? `← ${guardrailRefs.join(', ')}` : ''}`);

if (commitMsg) console.log(`\n   Commit: ${commitMsg}`);
if (testFiles.length > 0) {
  console.log('   Tests changed:');
  for (const f of testFiles) console.log(`     ${f}`);
}
if (missingRefs.length > 0) {
  console.log(`\n   ⚠️  Guardrail refs not found on disk: ${missingRefs.join(', ')}`);
}

// ── Verdict ───────────────────────────────────────────────────────────────────

if (!isFix) {
  console.log('\n✅ not a fix commit — guardrail rule does not apply\n');
  process.exit(0);
}

if (isExempt) {
  console.log('\n✅ fix is explicitly exempted — no guardrail required\n');
  process.exit(0);
}

if (hasTest) {
  console.log('\n✅ guardrail satisfied — test file present in this commit\n');
  process.exit(0);
}

if (hasGuardrailRef && missingRefs.length === 0) {
  console.log('\n✅ guardrail satisfied — existing guardrail referenced in commit body\n');
  process.exit(0);
}

// Violation
console.error('\n❌ NO GUARDRAIL — fix commit leaves no test and no guardrail reference');
console.error('   Options:');
console.error('   1. Add or modify a test file in this commit');
console.error('   2. Add [guardrail: path/to/test.mjs] to the commit body to reference an existing test');
console.error('   3. Add [fix-trivial] if this is a config/path/symlink fix with no logic');
console.error('   Principle #80: Every Pain Becomes a Guardrail.\n');

if (!REPORT) process.exit(1);
