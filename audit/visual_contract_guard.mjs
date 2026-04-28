#!/usr/bin/env node
'use strict';
/**
 * visual_contract_guard.mjs — Principles #61/#62 Structural Visual Contracts & Diff
 *
 * This guard verifies that the structural snapshot system — the JS-level model
 * that feeds visual contracts — is coherent, serializable, and stable across
 * two identical snapshot calls (idempotency). No Playwright or pixel comparison
 * is required; this is the fast CI gate that catches model drift without a browser.
 *
 * Pixel-level golden comparison lives in:
 *   reportforge/tests/user_parity/visual_golden_user_parity.test.mjs
 * and requires ImageMagick. This guard runs anywhere Node.js is available.
 *
 * RULE-A (VCONTRACT-SCHEMA-001): EngineCoreContracts.snapshotElements() must
 *   return an array where every entry has {id, sectionId, type, x, y, w, h}.
 *   Missing fields mean the snapshot cannot drive a layout comparison.
 *
 * RULE-B (VCONTRACT-SCHEMA-001): EngineCoreContracts.snapshotSections() must
 *   return an array where every entry has {id, stype, height}.
 *
 * RULE-C (VCONTRACT-IDEMPOTENT-001): Two consecutive calls to snapshotElements()
 *   and snapshotSections() on the same DS state must produce identical JSON.
 *   Non-idempotent snapshots are unreliable baselines.
 *
 * RULE-D (VCONTRACT-HASH-001): A layout hash (deterministic string over element
 *   positions and sizes) must be computable from the snapshot. The hash must
 *   change when any element's position or size changes.
 *
 * RULE-E (VCONTRACT-DIFF-001): The visual diff mechanism must be wired: the
 *   visual_golden_user_parity test file must exist and reference compareOrUpdateGolden
 *   and rmseThreshold — confirming pixel-level diff is defined even if Playwright-gated.
 *
 * Usage:
 *   node audit/visual_contract_guard.mjs          # fail on violations
 *   node audit/visual_contract_guard.mjs --report # report only
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

function fail(rule, file, desc) {
  violations.push({ rule, file, desc });
}

// ── RULE-E static check (no vm needed) ────────────────────────────────────────

const goldenTestPath = path.join(ROOT, 'reportforge/tests/user_parity/visual_golden_user_parity.test.mjs');
const goldenSrc = fs.existsSync(goldenTestPath) ? fs.readFileSync(goldenTestPath, 'utf8') : '';

if (!goldenSrc) {
  fail('VCONTRACT-DIFF-001', 'reportforge/tests/user_parity/visual_golden_user_parity.test.mjs',
    'visual golden test file missing — pixel diff mechanism not wired');
} else {
  if (!/compareOrUpdateGolden/.test(goldenSrc)) {
    fail('VCONTRACT-DIFF-001', 'visual_golden_user_parity.test.mjs',
      'test must call compareOrUpdateGolden — pixel diff not wired');
  }
  if (!/rmseThreshold/.test(goldenSrc)) {
    fail('VCONTRACT-DIFF-001', 'visual_golden_user_parity.test.mjs',
      'test must specify rmseThreshold — diff tolerance not defined');
  }
}

// ── Load EngineCoreContracts in vm sandbox ─────────────────────────────────────

const contractsSrc = fs.readFileSync(path.join(ENGINES, 'EngineCoreContracts.js'), 'utf8');

// Build a minimal DS mock with one section and one element.
function makeMockDS(overrides = {}) {
  return {
    zoom: 1,
    elements: [{
      id: 'e1', sectionId: 's1', type: 'text',
      x: 10, y: 20, w: 100, h: 30,
      fontSize: 12, color: '#000', bgColor: 'transparent',
      bold: false, italic: false, underline: false,
      align: 'left', zIndex: 1, content: 'Test',
    }],
    sections: [{
      id: 's1', stype: 'det', height: 60,
      visible: true, label: 'Detail', abbr: 'DET',
    }],
    selection: new Set(),
    getElementById(id) { return this.elements.find(e => e.id === id) || null; },
    getSectionTop(id) { return 0; },
    ...overrides,
  };
}

function loadContracts(DS, doc = null) {
  const mockGlobal = {
    DS,
    window: null,  // no DOM in static context
    document: doc,
    EngineRegistry: null,
    RF: { Geometry: { zoom: () => 1 } },
  };
  mockGlobal.window = mockGlobal;

  const ctx = vm.createContext(mockGlobal);
  // Strip module.exports footer — contracts factory needs globalThis assignment.
  vm.runInContext(contractsSrc, ctx);

  const factory = mockGlobal.EngineCoreContractsFactory || ctx.EngineCoreContractsFactory;
  if (typeof factory !== 'function') {
    fail('VCONTRACT-SCHEMA-001', 'EngineCoreContracts.js',
      'EngineCoreContractsFactory not exported — cannot load contracts in vm');
    return null;
  }
  return factory({
    doc,
    runtimeServices: null,
    getEngine: () => null,
  });
}

const DS = makeMockDS();
const contracts = loadContracts(DS);

if (contracts) {
  // RULE-A: snapshotElements schema.
  const elements = contracts.snapshotElements();
  if (!Array.isArray(elements) || elements.length === 0) {
    fail('VCONTRACT-SCHEMA-001', 'EngineCoreContracts.js',
      'snapshotElements() must return non-empty array when DS.elements is populated');
  } else {
    const required = ['id', 'sectionId', 'type', 'x', 'y', 'w', 'h'];
    for (const el of elements) {
      for (const field of required) {
        if (!(field in el)) {
          fail('VCONTRACT-SCHEMA-001', 'EngineCoreContracts.js',
            `snapshotElements() entry missing required field '${field}'`);
        }
      }
    }
  }

  // RULE-B: snapshotSections schema.
  const sections = contracts.snapshotSections();
  if (!Array.isArray(sections) || sections.length === 0) {
    fail('VCONTRACT-SCHEMA-001', 'EngineCoreContracts.js',
      'snapshotSections() must return non-empty array when DS.sections is populated');
  } else {
    for (const sec of sections) {
      for (const field of ['id', 'stype', 'height']) {
        if (!(field in sec)) {
          fail('VCONTRACT-SCHEMA-001', 'EngineCoreContracts.js',
            `snapshotSections() entry missing required field '${field}'`);
        }
      }
    }
  }

  // RULE-C: idempotency — two calls produce identical JSON.
  const snap1 = JSON.stringify({
    elements: contracts.snapshotElements(),
    sections: contracts.snapshotSections(),
  });
  const snap2 = JSON.stringify({
    elements: contracts.snapshotElements(),
    sections: contracts.snapshotSections(),
  });
  if (snap1 !== snap2) {
    fail('VCONTRACT-IDEMPOTENT-001', 'EngineCoreContracts.js',
      'snapshotElements()/snapshotSections() are not idempotent — two consecutive calls differ');
  }

  // RULE-D: layout hash changes on position/size mutation.
  function layoutHash(snap) {
    const els = JSON.parse(snap).elements;
    return els.map(e => `${e.id}:${e.x},${e.y},${e.w},${e.h}`).join('|');
  }
  const hash1 = layoutHash(snap1);

  // Mutate the element position.
  DS.elements[0].x = 99;
  const contracts2 = loadContracts(DS);
  if (contracts2) {
    const snap3 = JSON.stringify({ elements: contracts2.snapshotElements(), sections: contracts2.snapshotSections() });
    const hash2 = layoutHash(snap3);
    if (hash1 === hash2) {
      fail('VCONTRACT-HASH-001', 'EngineCoreContracts.js',
        'layout hash did not change after element position mutation — snapshot is not position-sensitive');
    }
  }
  // Restore.
  DS.elements[0].x = 10;
}

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Visual Contract Guard (#61/#62) ──────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ structural visual contracts coherent — snapshot schema, idempotency, hash sensitivity, pixel diff wired\n');
  process.exit(0);
}

console.error('\n❌ visual contract gap — snapshot system unreliable or pixel diff not wired');
console.error('   Fix: ensure snapshotElements/Sections return full schema, are idempotent, and golden test exists\n');
if (!REPORT) process.exit(1);
