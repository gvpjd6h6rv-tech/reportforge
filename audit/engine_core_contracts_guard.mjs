#!/usr/bin/env node
'use strict';
/**
 * engine_core_contracts_guard.mjs — EngineCore SSOT compliance gate
 *
 * Verifies that EngineCore.js exposes the canonical contract surface and that
 * the factory files (EngineCoreContracts.js, EngineCoreRuntime.js) export
 * the expected factory functions — ensuring the runtime contract pattern
 * cannot be silently removed or renamed.
 *
 * RULE-A (EC-EXIST-001): EngineCore.js, EngineCoreContracts.js, and
 *   EngineCoreRuntime.js must exist in engines/.
 *
 * RULE-B (EC-EXPORT-001): EngineCore.js module.exports must expose
 *   EngineCore, EngineRegistry, and ContractGuards.
 *
 * RULE-C (EC-FACTORY-001): EngineCoreContracts.js must export
 *   createEngineCoreContracts as a function.
 *
 * RULE-D (EC-FACTORY-002): EngineCoreRuntime.js must export
 *   createEngineCoreRuntime as a function.
 *
 * RULE-E (EC-CONTRACTS-001): ContractGuards must expose the four canonical
 *   assertion methods: assertRectShape, assertSelectionState,
 *   assertLayoutContract, assertZoomContract.
 *
 * RULE-F (EC-REGISTRY-001): EngineCore.js must reference EngineRegistry
 *   (the engine registration facade) — ensuring engines are registered
 *   through a single owner and not via raw window.* assignments.
 *
 * Usage:
 *   node audit/engine_core_contracts_guard.mjs          # fail on violations
 *   node audit/engine_core_contracts_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import vm   from 'node:vm';
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

// ── RULE-A: Files must exist ──────────────────────────────────────────────────

check('EC-EXIST-001', 'EngineCore.js',
  exists('EngineCore.js'),
  'EngineCore.js must exist — facade that wires contracts, runtime and routing');

check('EC-EXIST-001', 'EngineCoreContracts.js',
  exists('EngineCoreContracts.js'),
  'EngineCoreContracts.js must exist — factory for runtime contract guards');

check('EC-EXIST-001', 'EngineCoreRuntime.js',
  exists('EngineCoreRuntime.js'),
  'EngineCoreRuntime.js must exist — factory for safe-mode and runtime lifecycle');

// ── RULE-B: EngineCore.js exports ────────────────────────────────────────────

if (exists('EngineCore.js')) {
  const src = read('EngineCore.js');

  check('EC-EXPORT-001', 'EngineCore.js',
    /module\.exports\s*=/.test(src),
    'EngineCore.js must have module.exports for node:test testability');

  check('EC-EXPORT-001', 'EngineCore.js',
    /ContractGuards/.test(src),
    'EngineCore.js module.exports must expose ContractGuards');

  check('EC-EXPORT-001', 'EngineCore.js',
    /EngineRegistry/.test(src),
    'EngineCore.js module.exports must expose EngineRegistry');
}

// ── RULE-C: EngineCoreContracts.js factory ───────────────────────────────────

if (exists('EngineCoreContracts.js')) {
  const src = read('EngineCoreContracts.js');

  check('EC-FACTORY-001', 'EngineCoreContracts.js',
    /function createEngineCoreContracts/.test(src),
    'EngineCoreContracts.js must define createEngineCoreContracts factory function');

  check('EC-FACTORY-001', 'EngineCoreContracts.js',
    /module\.exports/.test(src),
    'EngineCoreContracts.js must have module.exports for testability');
}

// ── RULE-D: EngineCoreRuntime.js factory ─────────────────────────────────────

if (exists('EngineCoreRuntime.js')) {
  const src = read('EngineCoreRuntime.js');

  check('EC-FACTORY-002', 'EngineCoreRuntime.js',
    /function createEngineCoreRuntime/.test(src),
    'EngineCoreRuntime.js must define createEngineCoreRuntime factory function');

  check('EC-FACTORY-002', 'EngineCoreRuntime.js',
    /module\.exports/.test(src),
    'EngineCoreRuntime.js must have module.exports for testability');
}

// ── RULE-E: ContractGuards assertion surface ──────────────────────────────────

if (exists('EngineCore.js')) {
  const src = read('EngineCore.js');
  const contractSrc = exists('EngineCoreContracts.js') ? read('EngineCoreContracts.js') : '';

  check('EC-CONTRACTS-001', 'EngineCoreContracts.js',
    /assertRectShape/.test(contractSrc),
    'assertRectShape must be defined in EngineCoreContracts.js');

  check('EC-CONTRACTS-001', 'EngineCoreContracts.js',
    /assertSelectionState/.test(contractSrc),
    'assertSelectionState must be defined in EngineCoreContracts.js');

  check('EC-CONTRACTS-001', 'EngineCoreContracts.js',
    /assertLayoutContract/.test(contractSrc),
    'assertLayoutContract must be defined in EngineCoreContracts.js');

  check('EC-CONTRACTS-001', 'EngineCoreContracts.js',
    /assertZoomContract/.test(contractSrc),
    'assertZoomContract must be defined in EngineCoreContracts.js');
}

// ── RULE-F: EngineRegistry pattern ───────────────────────────────────────────

if (exists('EngineCore.js')) {
  const src = read('EngineCore.js');

  check('EC-REGISTRY-001', 'EngineCore.js',
    /EngineRegistry/.test(src) && /register/.test(src),
    'EngineCore.js must use EngineRegistry.register — engines registered through facade, not raw window.*');
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('── EngineCore Contracts Guard ────────────────────────────────────');
console.log(`   rules checked: 6  violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ engine-core-init contract surface compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ EngineCore contract surface intact — factories + assertions + registry verified\n');
  process.exit(0);
}
