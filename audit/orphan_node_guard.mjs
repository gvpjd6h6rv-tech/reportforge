#!/usr/bin/env node
'use strict';
/**
 * orphan_node_guard.mjs — Principle #60 Orphan Node Detection
 *
 * Static analysis verifying that the codebase has the structural guarantees
 * needed to prevent DOM orphan nodes — elements in the DOM with no model entry
 * and model entries with no DOM section parent.
 *
 * RULE-A (ORPHAN-CLEAR-001): CanvasLayoutElements.renderAll() must clear all
 *   .cr-element nodes before re-rendering. If renderAll() does not wipe the DOM
 *   first, stale elements accumulate as orphans on every re-render.
 *
 * RULE-B (ORPHAN-GUARD-001): EngineCoreContracts.js must export validateOrphanNodes.
 *   This function is the runtime gate; its absence means orphans are never detected.
 *
 * RULE-C (ORPHAN-RUNTIME-001): EngineCoreRuntime.js must call validateOrphanNodes()
 *   in its invariant-verification path (verifyRuntimeInvariants). Without this
 *   call orphan detection is defined but never exercised.
 *
 * RULE-D (ORPHAN-DOM-001): renderElement() must not append to document.body or any
 *   node other than the canonical section container. Elements must land in their
 *   section or be dropped — never floated to the document root.
 *
 * Usage:
 *   node audit/orphan_node_guard.mjs          # fail on violations
 *   node audit/orphan_node_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const read = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

const canvasElements  = read('CanvasLayoutElements.js');
const coreContracts   = read('EngineCoreContracts.js');
const coreRuntime     = read('EngineCoreRuntime.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

// RULE-A: renderAll must clear before re-render.
// Must contain querySelectorAll('.cr-element') + .remove() or .forEach(e => e.remove())
check('ORPHAN-CLEAR-001', 'CanvasLayoutElements.js',
  /querySelectorAll\s*\(\s*['"`]\.cr-element['"`]\s*\)/.test(canvasElements) &&
  /\.remove\s*\(\s*\)/.test(canvasElements),
  'renderAll() must querySelectorAll(\'.cr-element\') and remove() all nodes before re-rendering to prevent DOM orphans');

// RULE-B: EngineCoreContracts must export validateOrphanNodes.
check('ORPHAN-GUARD-001', 'EngineCoreContracts.js',
  /validateOrphanNodes/.test(coreContracts),
  'EngineCoreContracts.js must define and export validateOrphanNodes for runtime orphan detection');

check('ORPHAN-GUARD-001', 'EngineCoreContracts.js',
  /orphan\.dom-element/.test(coreContracts),
  'validateOrphanNodes must push issue code \'orphan.dom-element\' for DOM elements with no DS model entry');

check('ORPHAN-GUARD-001', 'EngineCoreContracts.js',
  /orphan\.model-element/.test(coreContracts),
  'validateOrphanNodes must push issue code \'orphan.model-element\' for DS entries with no DOM section');

// RULE-C: EngineCoreRuntime must call validateOrphanNodes in the invariant path.
check('ORPHAN-RUNTIME-001', 'EngineCoreRuntime.js',
  /validateOrphanNodes\s*\(/.test(coreRuntime),
  'EngineCoreRuntime.js must call validateOrphanNodes(collectedIssues) inside verifyRuntimeInvariants');

check('ORPHAN-RUNTIME-001', 'EngineCoreRuntime.js',
  /validateOrphanNodes\s*=\s*typeof\s+deps\.validateOrphanNodes/.test(coreRuntime),
  'EngineCoreRuntime.js must accept validateOrphanNodes from deps (injected dependency)');

// RULE-D: renderElement must not append to document.body.
check('ORPHAN-DOM-001', 'CanvasLayoutElements.js',
  !/document\.body\.(appendChild|insertBefore|append)\s*\(/.test(canvasElements),
  'CanvasLayoutElements.js must not append elements directly to document.body — use section container only');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Orphan Node Guard (#60) ───────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ orphan node detection in place — DOM↔model cross-check is wired\n');
  process.exit(0);
}

console.error('\n❌ orphan node detection gap — DOM elements may accumulate without model backing');
console.error('   Fix: ensure renderAll() clears before render, validateOrphanNodes() is wired into invariants\n');
if (!REPORT) process.exit(1);
