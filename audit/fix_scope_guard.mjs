#!/usr/bin/env node
'use strict';
/**
 * fix_scope_guard.mjs — Principle #72 Fix Scope Discipline / #77 Cause over Cosmetic Fixes
 *
 * Audits the last git commit (or working tree diff) for scope violations:
 *   - A bug fix must not touch more than 2 productive files unless it is an
 *     explicit architecture cut (commit message contains [arch-cut] or [arch]).
 *
 * "Productive files" = non-test, non-doc, non-config source files.
 * Test files, docs, audit scripts, and config are excluded from the count.
 *
 * Usage:
 *   node audit/fix_scope_guard.mjs              # check last commit
 *   node audit/fix_scope_guard.mjs --staged     # check staged changes
 *   node audit/fix_scope_guard.mjs --report     # report only, no exit 1
 *
 * Exit codes:
 *   0 — scope OK or architecture cut
 *   1 — scope violation detected (and --report not set)
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args   = process.argv.slice(2);
const STAGED = args.includes('--staged');
const REPORT = args.includes('--report');

// Files that do NOT count toward productive-file scope
const EXCLUDED_PATTERNS = [
  /^reportforge\/tests\//,
  /^audit\//,
  /^docs\//,
  /\.test\.(mjs|js|py)$/,
  /\.md$/,
  /\.json$/,
  /\.sh$/,
  /^\.github\//,
  /^\.venv\//,
  /requirements/,
  /setup\.(py|cfg)$/,
  /pyproject\.toml$/,
];

function isProductiveFile(f) {
  return !EXCLUDED_PATTERNS.some((re) => re.test(f));
}

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// Get changed files
let diffOutput;
if (STAGED) {
  diffOutput = run('git diff --cached --name-only');
} else {
  diffOutput = run('git diff --name-only HEAD~1 HEAD');
  if (!diffOutput) {
    // Fallback: working tree
    diffOutput = run('git diff --name-only');
  }
}

const changedFiles = diffOutput.split('\n').filter(Boolean);
const productiveFiles = changedFiles.filter(isProductiveFile);

// Get commit message (only for last-commit check)
let commitMsg = '';
if (!STAGED) {
  commitMsg = run('git log -1 --format=%s%n%b');
}

const isArchCut = /\[(arch|arch-cut|architecture)\]/i.test(commitMsg);
const scopeOk   = productiveFiles.length <= 2 || isArchCut;

// Report
console.log('── Fix Scope Guard (#72 / #77) ─────────────────────────────');
console.log(`   mode:              ${STAGED ? 'staged' : 'last commit'}`);
console.log(`   total changed:     ${changedFiles.length}`);
console.log(`   productive files:  ${productiveFiles.length}`);
console.log(`   arch-cut exempt:   ${isArchCut}`);
console.log(`   scope limit:       2 productive files`);

if (productiveFiles.length > 0) {
  console.log('\n   Productive files changed:');
  for (const f of productiveFiles) {
    const marker = productiveFiles.length > 2 && !isArchCut ? '  ⚠️ ' : '     ';
    console.log(`${marker}${f}`);
  }
}

if (!STAGED && commitMsg) {
  const subject = commitMsg.split('\n')[0];
  console.log(`\n   Commit: ${subject}`);
}

if (scopeOk) {
  console.log('\n✅ scope OK\n');
} else {
  console.error(`\n❌ SCOPE VIOLATION — ${productiveFiles.length} productive files changed (limit: 2)`);
  console.error('   If this is an architecture cut, add [arch] to the commit message.');
  console.error('   Principle #72: Fix Scope Discipline — one owner, one cause, one fix.\n');
  if (!REPORT) process.exit(1);
}
