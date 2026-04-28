#!/usr/bin/env node
'use strict';
/**
 * reset_stability_guard.mjs — Principles #39 Reset limpio / #66 Hard Reset Stability
 *
 * Static analysis scan that enforces two rules:
 *
 *   RULE-A (#39): No engine file may register a setInterval without storing the
 *   handle. An unguarded setInterval creates a zombie timer that survives any
 *   in-page "reset" and can only be stopped by a full page reload — making
 *   soft reset semantically impossible.
 *
 *   RULE-B (#39/#66): DocumentState.js must NOT expose a reset/reinit API that
 *   bypasses elementCounter. The counter is module-level state; the only safe
 *   reset is a page reload. If someone adds a partial reset that skips the
 *   counter, it creates ID collisions — a hard-reset corruption pattern.
 *
 *   RULE-C (#66): Any engine file that calls setInterval MUST either:
 *     (a) store the return value (e.g.  const _t = setInterval(...) ), or
 *     (b) export a destroy/teardown/cleanup symbol in the same file.
 *   Without (a) or (b) the interval is a zombie — hard reset cannot clear it.
 *
 * Usage:
 *   node audit/reset_stability_guard.mjs            # scan engines/ directory
 *   node audit/reset_stability_guard.mjs --report   # report only, no exit 1
 *   node audit/reset_stability_guard.mjs --verbose  # show all findings
 *
 * Exit codes:
 *   0 — no violations found
 *   1 — violations found (and --report not set)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const args    = process.argv.slice(2);
const REPORT  = args.includes('--report');
const VERBOSE = args.includes('--verbose');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readEngineFiles() {
  return fs.readdirSync(ENGINES)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({
      rel  : `engines/${f}`,
      abs  : path.join(ENGINES, f),
      lines: fs.readFileSync(path.join(ENGINES, f), 'utf8').split('\n'),
    }));
}

// Match:  setInterval(...)  — the call itself
const SET_INTERVAL_CALL = /\bsetInterval\s*\(/;
// Match:  <anything> = setInterval(...)  — result stored
const SET_INTERVAL_STORED = /(?:const|let|var|window\.\w+|this\.\w+|\w+)\s*=\s*setInterval\s*\(/;
// Match teardown/destroy export in file
const TEARDOWN_EXPORT = /(?:window\.|exports\.|module\.exports\b)[\w.]*(?:destroy|teardown|cleanup|stop)\b/i;

// RULE-B: reset-like method that does NOT touch elementCounter
// We look for a function named reset/reinit/clearAll in DocumentState.js
// that exists but doesn't reference elementCounter — that's a partial reset trap
const RESET_LIKE_FN    = /(?:function\s+(?:reset|reinit|clearAll|hardReset)|(?:reset|reinit|clearAll|hardReset)\s*[:=]\s*function)/i;
const COUNTER_REF      = /elementCounter/;

// ── Scan ──────────────────────────────────────────────────────────────────────

const violations = [];
const files = readEngineFiles();

for (const { rel, abs, lines } of files) {
  const src = lines.join('\n');

  // RULE-A / RULE-C: unguarded setInterval
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!SET_INTERVAL_CALL.test(line)) continue;

    // Check if the return value is stored on this line
    if (SET_INTERVAL_STORED.test(line)) {
      if (VERBOSE) console.log(`  ok (stored)  ${rel}:${i + 1}: ${line.trim()}`);
      continue;
    }

    // Not stored on the call line — check if file has a teardown export (RULE-C escape)
    if (TEARDOWN_EXPORT.test(src)) {
      if (VERBOSE) console.log(`  ok (teardown exported)  ${rel}:${i + 1}: ${line.trim()}`);
      continue;
    }

    // Violation: timer handle neither stored nor teardown exported
    violations.push({
      rule : 'RESET-TIMER-001',
      file : rel,
      line : i + 1,
      text : line.trim(),
      desc : 'setInterval result not stored and no teardown export — zombie timer on reload',
    });
  }

  // RULE-B: partial reset in DocumentState.js
  if (rel === 'engines/DocumentState.js') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!RESET_LIKE_FN.test(line)) continue;

      // Grab the next ~20 lines as the function body
      const body = lines.slice(i, i + 20).join('\n');
      if (!COUNTER_REF.test(body)) {
        violations.push({
          rule : 'RESET-COUNTER-001',
          file : rel,
          line : i + 1,
          text : line.trim(),
          desc : 'reset-like function in DocumentState.js does not reset elementCounter — partial reset creates ID collisions',
        });
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('── Reset Stability Guard (#39 / #66) ────────────────────────');
console.log(`   engines scanned:  ${files.length}`);
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.desc}`);
  }
}

// ── Known gap note ────────────────────────────────────────────────────────────
// DocumentState.js elementCounter is module-level and cannot be reset without
// a page reload. This is the designed behaviour — soft reset is not supported.
// This guard does NOT flag that fact; it only flags patterns that would make
// the situation WORSE (partial resets that skip the counter, or zombie timers
// that accumulate across "reloads" in test environments).

if (violations.length === 0) {
  console.log('\n✅ no zombie timers or partial-reset traps detected\n');
  process.exit(0);
}

console.error('\n❌ reset stability violations — hard reset cannot be guaranteed clean');
console.error('   Fix: store setInterval return value OR export a destroy() function');
console.error('   Principle #39: Reset limpio. Principle #66: Hard Reset Stability.\n');

if (!REPORT) process.exit(1);
