#!/usr/bin/env node
'use strict';
/**
 * history_state_guard.mjs — SS-02 history SSOT compliance gate
 *
 * Verifies that HistoryState.js is a pure, side-effect-free factory —
 * no DOM references, no globals, no singleton state — so it can be
 * tested and reused without browser context.
 *
 * RULE-A (HS-EXIST-001): HistoryState.js must exist in engines/.
 *
 * RULE-B (HS-EXPORT-001): HistoryState.js must have module.exports for
 *   node:test testability.
 *
 * RULE-C (HS-API-001): HistoryState.js must export createHistoryState —
 *   the factory function that creates independent stack instances.
 *
 * RULE-D (HS-PURITY-001): HistoryState.js must NOT reference DOM or
 *   mutable global state: no document, window, DS, localStorage.
 *
 * RULE-E (HS-FACTORY-001): HistoryState.js must NOT use top-level mutable
 *   variable declarations outside the factory — no singleton pattern.
 *   Allowed pattern: const X = (() => { ... })(); at top level (IIFE).
 *   Forbidden: top-level `let` or `var` declarations.
 *
 * Usage:
 *   node audit/history_state_guard.mjs          # fail on violations
 *   node audit/history_state_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

const exists = (f) => fs.existsSync(path.join(ENGINES, f));
const read   = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

// ── RULE-A: HistoryState.js must exist ───────────────────────────────────────

check('HS-EXIST-001', 'HistoryState.js',
  exists('HistoryState.js'),
  'HistoryState.js must exist — pure factory for undo/redo stack state');

if (exists('HistoryState.js')) {
  const src = read('HistoryState.js');

  // ── RULE-B: module.exports ─────────────────────────────────────────────────
  check('HS-EXPORT-001', 'HistoryState.js',
    /module\.exports/.test(src),
    'HistoryState.js must have module.exports for node:test testability');

  // ── RULE-C: createHistoryState exported ───────────────────────────────────
  check('HS-API-001', 'HistoryState.js',
    /\bcreateHistoryState\b/.test(src),
    'HistoryState.js must export createHistoryState factory function');

  // ── RULE-D: no DOM or mutable global references ───────────────────────────
  const FORBIDDEN_PATTERNS = [
    { pattern: /\bdocument\b/,    label: 'document' },
    { pattern: /\blocalStorage\b/, label: 'localStorage' },
    { pattern: /\bDS\b/,           label: 'DS' },
    { pattern: /\bwindow\b/,       label: 'window' },
  ];

  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    check('HS-PURITY-001', 'HistoryState.js',
      !pattern.test(src),
      `HistoryState.js must not reference: ${label} (pure factory — no DOM/state)`);
  }

  // ── RULE-E: no top-level mutable singleton declarations ───────────────────
  // Strip the IIFE wrapper line (const X = (() => { and closing }) to avoid
  // false positives from inner let/var declarations inside the factory body.
  // We check for `let` or `var` declarations at line-start (no indentation),
  // which indicates top-level module scope rather than factory scope.
  const topLevelLetVar = src
    .split('\n')
    .filter(line => /^(let|var)\s/.test(line.trim()) && !/^\s{2,}/.test(line));

  check('HS-FACTORY-001', 'HistoryState.js',
    topLevelLetVar.length === 0,
    `HistoryState.js must not declare top-level mutable singletons (let/var at module scope) — found: ${topLevelLetVar.join('; ')}`);
}

// ── Report ────────────────────────────────────────────────────────────────────

const rulesChecked = 1 + (exists('HistoryState.js') ? 1 + 1 + 4 + 1 : 0);
console.log('── History State Guard ────────────────────────────────────────');
console.log(`   rules checked: ${rulesChecked}  violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ history-state purity contract compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ HistoryState pure-factory contract intact — API + purity + no-singleton verified\n');
  process.exit(0);
}
