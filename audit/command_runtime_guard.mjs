#!/usr/bin/env node
'use strict';
/**
 * command_runtime_guard.mjs — SS-08 commands SSOT compliance gate
 *
 * Verifies that CommandRuntime.js is a pure delegation facade and has not been
 * inlined with command logic — ensuring the boundary between wiring and
 * implementation cannot be silently collapsed.
 *
 * RULE-A (CR-EXIST-001): CommandRuntime.js must exist in engines/.
 *
 * RULE-B (CR-GLOBALS-001): CommandRuntime.js must register all canonical
 *   global entry-points:
 *   CommandEngine, FileEngine, handleAction, switchDocType,
 *   handleToolSelection, handleViewSelection, handleZoomSelection,
 *   handleFormatAction, handleFontFamilyChange, handleFontSizeChange,
 *   initCommandRuntimeState.
 *
 * RULE-C (CR-DELEGATION-001): CommandRuntime.js must reference all four
 *   sub-module names it delegates to:
 *   CommandRuntimeSelection, CommandRuntimeView, CommandRuntimeSections,
 *   CommandRuntimeFile, CommandRuntimeDocType, CommandRuntimeHandlers,
 *   CommandRuntimeInit.
 *
 * RULE-D (CR-NOINLINE-001): CommandRuntime.js must NOT contain inline
 *   command logic — it must not define any named functions (function declarations
 *   or function expressions assigned to variables). The only allowed patterns
 *   are Object.assign, property access and global assignment.
 *
 * RULE-E (CR-EXPORT-001): CommandRuntime.js must have module.exports or the
 *   IIFE pattern wrapping (window) — confirming it is a testable wiring unit.
 *
 * Usage:
 *   node audit/command_runtime_guard.mjs          # fail on violations
 *   node audit/command_runtime_guard.mjs --report # report only
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

// ── RULE-A: CommandRuntime.js must exist ──────────────────────────────────────

check('CR-EXIST-001', 'CommandRuntime.js',
  exists('CommandRuntime.js'),
  'CommandRuntime.js must exist — facade that wires all command sub-modules');

if (exists('CommandRuntime.js')) {
  const src = read('CommandRuntime.js');

  // ── RULE-B: canonical global entry-points ──────────────────────────────────
  const REQUIRED_GLOBALS = [
    'CommandEngine',
    'FileEngine',
    'handleAction',
    'switchDocType',
    'handleToolSelection',
    'handleViewSelection',
    'handleZoomSelection',
    'handleFormatAction',
    'handleFontFamilyChange',
    'handleFontSizeChange',
    'initCommandRuntimeState',
  ];

  for (const g of REQUIRED_GLOBALS) {
    check('CR-GLOBALS-001', 'CommandRuntime.js',
      new RegExp(`\\b${g}\\b`).test(src),
      `CommandRuntime.js must register global: ${g}`);
  }

  // ── RULE-C: sub-module delegation references ──────────────────────────────
  const REQUIRED_DELEGATES = [
    'CommandRuntimeSelection',
    'CommandRuntimeView',
    'CommandRuntimeSections',
    'CommandRuntimeFile',
    'CommandRuntimeDocType',
    'CommandRuntimeHandlers',
    'CommandRuntimeInit',
  ];

  for (const d of REQUIRED_DELEGATES) {
    check('CR-DELEGATION-001', 'CommandRuntime.js',
      src.includes(d),
      `CommandRuntime.js must reference sub-module: ${d}`);
  }

  // ── RULE-D: no inline function definitions ────────────────────────────────
  // CommandRuntime.js is an IIFE wrapper — the only `function` keyword allowed
  // is the IIFE itself (e.g. `function initCommandRuntime`).
  // Any additional function keyword indicates inlined logic.
  const fnCount = (src.match(/\bfunction\b/g) ?? []).length;

  check('CR-NOINLINE-001', 'CommandRuntime.js',
    fnCount <= 1,
    `CommandRuntime.js must not define inline functions (found ${fnCount} function keywords, expected ≤1 for the IIFE wrapper)`);

  // ── RULE-E: IIFE(window) or module.exports pattern ────────────────────────
  check('CR-EXPORT-001', 'CommandRuntime.js',
    /\}\s*\)\s*\(\s*window\s*\)/.test(src) || /module\.exports/.test(src),
    'CommandRuntime.js must use IIFE(window) or module.exports pattern for testability');
}

// ── Report ────────────────────────────────────────────────────────────────────

const rulesChecked = 1 + (exists('CommandRuntime.js') ? 4 + 11 + 7 : 0);
console.log('── Command Runtime Guard ──────────────────────────────────────');
console.log(`   rules checked: ${rulesChecked}  violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ command-runtime facade contract surface compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ CommandRuntime facade intact — globals + delegation + no-inline verified\n');
  process.exit(0);
}
