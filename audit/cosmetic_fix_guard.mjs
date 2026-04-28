#!/usr/bin/env node
'use strict';
/**
 * cosmetic_fix_guard.mjs — Principle #77 Cause over Cosmetic Fixes
 *
 * Audits the last git commit (or working tree) for cosmetic-fix anti-patterns.
 *
 * A commit is a COSMETIC FIX (violation) when ALL of the following are true:
 *   1. The commit message signals it is a bug fix
 *      (starts with fix:, fix(…):, bugfix:, hotfix:, patch:)
 *   2. The only changed productive files are "presentation-only"
 *      (.html, .css, string-literal-only .js diffs, image/binary assets)
 *   3. No causal file was touched — i.e. no engine .js / .py logic file
 *   4. No test file was added or modified in the same commit
 *
 * A commit is CAUSAL (OK) when it is a fix AND at least one of:
 *   a. A logic file (engine .js or .py source) was changed, OR
 *   b. A test file was added or modified, OR
 *   c. The commit is explicitly exempted with [cosmetic-ok] or [visual-fix]
 *      (for intentional visual-only fixes that are known to be presentation-only)
 *
 * Usage:
 *   node audit/cosmetic_fix_guard.mjs              # check last commit
 *   node audit/cosmetic_fix_guard.mjs --staged     # check staged changes
 *   node audit/cosmetic_fix_guard.mjs --report     # report only, no exit 1
 *
 * Exit codes:
 *   0 — not a fix commit, or fix is causal, or explicitly exempted
 *   1 — cosmetic fix detected (and --report not set)
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args   = process.argv.slice(2);
const STAGED = args.includes('--staged');
const REPORT = args.includes('--report');

// ── Patterns ──────────────────────────────────────────────────────────────────

// Commit prefixes that signal a bug fix
const FIX_PREFIX = /^(fix|bugfix|hotfix|patch)(\([^)]+\))?:/i;

// Explicit exemptions in commit message — intentional visual-only fix
const EXEMPT_MARKERS = /\[(cosmetic-ok|visual-fix|ux-fix|css-fix)\]/i;

// Architecture cut exemption (same as fix_scope_guard)
const ARCH_CUT = /\[(arch|arch-cut|architecture)\]/i;

// Files that count as "presentation-only" — changing them alone = cosmetic
const PRESENTATION_PATTERNS = [
  /\.html$/,
  /\.css$/,
  /\.scss$/,
  /\.less$/,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/,
  /\.json$/, // config/data, not logic
  /\.md$/,
  /^docs\//,
  /^audit\//,
  /baselines\//,
  /fixtures\//,
];

// Files that count as "logic/causal" — changing them = causal fix
const LOGIC_PATTERNS = [
  /^engines\/.*\.js$/,
  /^reportforge\/core\/.*\.py$/,
  /^reportforge\/server\/.*\.py$/,
  /^reportforge_server\.py$/,
  /^designer\/.*\.js$/, // JS in designer dir (not HTML)
];

// Files that count as "test" — adding/modifying them = causal evidence
const TEST_PATTERNS = [
  /^reportforge\/tests\/.*\.(py|mjs|js)$/,
  /\.test\.(mjs|js|py)$/,
  /test_.*\.py$/,
  /tanda\d+\.test\.mjs$/,
];

function isPresentation(f) { return PRESENTATION_PATTERNS.some((re) => re.test(f)); }
function isLogic(f)        { return LOGIC_PATTERNS.some((re) => re.test(f)); }
function isTest(f)         { return TEST_PATTERNS.some((re) => re.test(f)); }

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// ── Get commit info ───────────────────────────────────────────────────────────

let changedFiles = [];
let commitMsg    = '';
let commitHash   = '';

if (STAGED) {
  changedFiles = run('git diff --cached --name-only').split('\n').filter(Boolean);
  commitMsg    = ''; // no commit message yet in staged mode
} else {
  changedFiles = run('git diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean);
  if (!changedFiles.length) {
    changedFiles = run('git diff --name-only').split('\n').filter(Boolean);
  }
  commitMsg  = run('git log -1 --format=%s%n%b');
  commitHash = run('git log -1 --format=%h');
}

// ── Classify changed files ────────────────────────────────────────────────────

const logicFiles       = changedFiles.filter(isLogic);
const testFiles        = changedFiles.filter(isTest);
const presentationFiles = changedFiles.filter(isPresentation);
const otherFiles       = changedFiles.filter((f) => !isLogic(f) && !isTest(f) && !isPresentation(f));

// ── Is this a fix commit? ─────────────────────────────────────────────────────

const isFix      = FIX_PREFIX.test(commitMsg) || (STAGED && FIX_PREFIX.test(''));
const isExempt   = EXEMPT_MARKERS.test(commitMsg) || ARCH_CUT.test(commitMsg);

// ── Determine causality ───────────────────────────────────────────────────────

const hasCausalLogic = logicFiles.length > 0;
const hasCausalTest  = testFiles.length > 0;
const isCausal       = hasCausalLogic || hasCausalTest;

// A commit is cosmetic if it's a fix AND only presentation/other files changed
// AND no logic AND no test
const isPresentationOnly = changedFiles.length > 0 &&
  changedFiles.every((f) => isPresentation(f) || otherFiles.includes(f)) &&
  !hasCausalLogic &&
  !hasCausalTest;

// Specific HTML-only fix pattern (historically risky in this repo)
const isHtmlOnlyFix = isFix && changedFiles.every((f) => f.endsWith('.html'));

// ── Report ────────────────────────────────────────────────────────────────────

console.log('── Cosmetic Fix Guard (#77) ─────────────────────────────────');
if (commitHash) console.log(`   commit:            ${commitHash}`);
console.log(`   mode:              ${STAGED ? 'staged' : 'last commit'}`);
console.log(`   is fix commit:     ${isFix}`);
console.log(`   exempt marker:     ${isExempt}`);
console.log(`   logic files:       ${logicFiles.length}`);
console.log(`   test files:        ${testFiles.length}`);
console.log(`   presentation only: ${isPresentationOnly}`);
console.log(`   causal:            ${isCausal}`);

if (changedFiles.length > 0) {
  console.log('\n   Changed files by category:');
  for (const f of logicFiles)        console.log(`     [logic]        ${f}`);
  for (const f of testFiles)         console.log(`     [test]         ${f}`);
  for (const f of presentationFiles) console.log(`     [presentation] ${f}`);
  for (const f of otherFiles)        console.log(`     [other]        ${f}`);
}

if (commitMsg) {
  const subject = commitMsg.split('\n')[0];
  console.log(`\n   Commit: ${subject}`);
}

// ── Verdict ───────────────────────────────────────────────────────────────────

if (!isFix) {
  console.log('\n✅ not a fix commit — no cosmetic-fix check needed\n');
  process.exit(0);
}

if (isExempt) {
  console.log('\n✅ fix is explicitly exempted ([cosmetic-ok] / [visual-fix] / [arch])\n');
  process.exit(0);
}

if (!changedFiles.length) {
  console.log('\n✅ no changed files to classify\n');
  process.exit(0);
}

if (isCausal) {
  console.log('\n✅ fix is CAUSAL — touches logic or adds test evidence\n');
  process.exit(0);
}

// Violation
const reasons = [];
if (isHtmlOnlyFix) reasons.push('only HTML changed — visual presentation, no logic');
else if (isPresentationOnly) reasons.push('only presentation files changed (HTML/CSS/assets) — no causal owner touched');
else reasons.push('no logic file and no test file in this fix commit');

console.error(`\n❌ COSMETIC FIX DETECTED — ${reasons.join('; ')}`);
console.error('   A fix must touch the causal owner (logic file) or add a regression test.');
console.error('   If this is an intentional visual-only change, add [visual-fix] to the commit message.');
console.error('   Principle #77: Cause over Cosmetic Fixes.\n');

if (!REPORT) process.exit(1);
