#!/usr/bin/env node
'use strict';
/**
 * history_state_guard.mjs — SS-34 history retirement/SSOT compliance gate
 *
 * HistoryState.js (the old factory-based test harness for undo/redo stack
 * state) was retired in P14F once its observable coverage was fully migrated
 * to history_engine.test.mjs. This guard now protects the post-retirement
 * invariant instead of the old file's purity contract:
 *
 * RULE-A (HS-RETIRED-001): HistoryState.js must NOT exist in engines/ —
 *   confirms the retirement holds and the file is not silently reintroduced.
 *
 * RULE-B (HE-API-001): HistoryEngine.js must exist and export the public API
 *   surface that replaced HistoryState.js: push, undo, redo, canUndo,
 *   canRedo, suppress, onChange, clear.
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

// ── RULE-A: HistoryState.js must NOT exist (retirement holds) ───────────────

check('HS-RETIRED-001', 'HistoryState.js',
  !exists('HistoryState.js'),
  'HistoryState.js must stay retired — coverage was migrated to history_engine.test.mjs in P14F');

// ── RULE-B: HistoryEngine.js owns the public API that replaced it ───────────

check('HE-API-001', 'HistoryEngine.js',
  exists('HistoryEngine.js'),
  'HistoryEngine.js must exist — sole implementation owner since HistoryState.js retirement');

if (exists('HistoryEngine.js')) {
  const src = read('HistoryEngine.js');
  const REQUIRED_API = ['push', 'undo', 'redo', 'canUndo', 'canRedo', 'suppress', 'onChange', 'clear'];

  for (const member of REQUIRED_API) {
    check('HE-API-001', 'HistoryEngine.js',
      new RegExp(`\\b${member}\\s*\\(`).test(src),
      `HistoryEngine.js must export ${member}() — part of the API that replaced HistoryState.js`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('── History State Guard ────────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ history retirement/SSOT contract compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ HistoryState retirement holds, HistoryEngine API contract intact\n');
  process.exit(0);
}
