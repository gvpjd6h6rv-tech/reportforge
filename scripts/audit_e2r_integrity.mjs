#!/usr/bin/env node
/**
 * audit_e2r_integrity.mjs — E2R Integrity Auditor
 *
 * Audits E2R data for false positives, false negatives, boundary smells,
 * and evidence quality issues. Does NOT modify scores, ownership, or subsystems.
 *
 * Inputs:
 *   audit/e2r_coverage.json
 *   audit/e2r_run_manifest.json
 *   audit/subsystem_ownership_map.json
 *   audit/e2r_baseline.json
 *
 * Exit:
 *   1 — CRITICAL issues found
 *   0 — only WARNING / INFO (or clean)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

function load(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

const coverage  = load('audit/e2r_coverage.json');
const manifest  = load('audit/e2r_run_manifest.json');
const ownerMap  = load('audit/subsystem_ownership_map.json');
const baseline  = load('audit/e2r_baseline.json');

const ownerById = Object.fromEntries((ownerMap.subsystems ?? []).map((s) => [s.id, s]));
const baseById  = Object.fromEntries(baseline.subsystems.map((s) => [s.id, s]));

// ─────────────────────────────────────────────────────────────────────────────
// MATCHING LOGIC — strong evidence only
// A test is associated to a subsystem only if at least one condition holds:
//   M1. entry has a .subsystems array containing subsystem id exactly
//   M2. basename of an allowedFile appears in entry.file or entry.command
//   M3. owner (if not "unassigned") appears in entry.file or entry.command
//   M4. entry.command includes --test-name-pattern=<subsystem id>
//   M5. basename of entry.file contains subsystem id exactly (case-insensitive)
//   M6. entry.file appears in subsystem.existingTests (declared association — always valid)
//
// Evidence tiers:
//   strong  — M1–M5 (naming/structural signal beyond declaration)
//   declared — M6 only (explicit ownership-map association)
//   Absence of M1–M5 when M6 exists → INFO "declared-only", NOT a false positive.
//   Absence of all → not associated.
// ─────────────────────────────────────────────────────────────────────────────
function matchesSubsystem(entry, sub) {
  const file    = (entry.file    ?? '').toLowerCase();
  const command = (entry.command ?? '').toLowerCase();
  const subId   = sub.id.toLowerCase();

  // M1 — explicit subsystems array
  if (Array.isArray(entry.subsystems) && entry.subsystems.includes(sub.id)) return 'strong';

  // M2 — allowedFiles basenames
  for (const af of sub.allowedFiles ?? []) {
    const bn = basename(af).toLowerCase();
    if (file.includes(bn) || command.includes(bn)) return 'strong';
  }

  // M3 — owner string (skip "unassigned")
  if (sub.owner && sub.owner !== 'unassigned') {
    const owner = sub.owner.toLowerCase();
    if (file.includes(owner) || command.includes(owner)) return 'strong';
  }

  // M4 — --test-name-pattern=<subsystem id>
  if (command.includes(`--test-name-pattern=${subId}`)) return 'strong';

  // M5 — test file basename contains subsystem id
  const fileBn = basename(file);
  if (fileBn.includes(subId)) return 'strong';

  // M6 — declared in existingTests (valid evidence, weaker signal)
  if ((sub.existingTests ?? []).includes(entry.file)) return 'declared';

  return null; // no match
}

// Pre-compute matches: test file → Map<subsystem id, tier ('strong'|'declared')>
const matchTiers = new Map(); // entry.file → Map<subsystem id, tier>

// Also index existingTests (declared association in ownership map)
const existingTestsById = {}; // subsystem id → Set of test files
for (const sub of ownerMap.subsystems ?? []) {
  existingTestsById[sub.id] = new Set(sub.existingTests ?? []);
}

let totalDiscarded = 0;

for (const entry of manifest) {
  const tiers = new Map(); // subsystem id → tier
  for (const sub of ownerMap.subsystems ?? []) {
    const tier = matchesSubsystem(entry, sub);
    if (tier) tiers.set(sub.id, tier);
  }
  matchTiers.set(entry.file, tiers);
  if (tiers.size === 0) totalDiscarded++;
}

const totalAssociated = manifest.length - totalDiscarded;

// Helper: get best tier for a test→subsystem pair
function getTier(testFile, subId) {
  return matchTiers.get(testFile)?.get(subId) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Issues collector
// ─────────────────────────────────────────────────────────────────────────────
const criticals = [];
const warnings  = [];
const infos     = [];

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 False Positive Risk
// A subsystem has coverageReal > 0 but its passing tests don't match it strongly
// ─────────────────────────────────────────────────────────────────────────────
const fpRisks = [];

for (const covSub of coverage.subsystems) {
  if (covSub.coverageReal === 0) continue;

  const strongConfirmed   = covSub.passingTests.filter((f) => getTier(f, covSub.id) === 'strong');
  const declaredOnly      = covSub.passingTests.filter((f) => getTier(f, covSub.id) === 'declared');
  const unmatched         = covSub.passingTests.filter((f) => !getTier(f, covSub.id));

  if (unmatched.length > 0) {
    // Passing tests counted in coverageReal but not associated by any rule
    const msg = `${covSub.id} ${covSub.name}: ${unmatched.length}/${covSub.passingTests.length} passing tests not associated by any matching rule`;
    if (covSub.risk === 'critical' || covSub.tier === 'core') {
      criticals.push(`[FP-CRITICAL] ${msg}`);
    } else {
      warnings.push(`[FP-WARN] ${msg}`);
    }
    fpRisks.push(covSub.id);
  }

  if (strongConfirmed.length === 0 && declaredOnly.length > 0) {
    // M6-only: valid but no structural signal — report as INFO
    infos.push(`[FP-INFO] ${covSub.id} ${covSub.name}: declared-only evidence (${declaredOnly.length} test(s), no M1–M5 match) — coverage is valid but unverifiable by naming`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧊 False Negative Risk
// Tests pass but are not associated to any subsystem via existingTests
// ─────────────────────────────────────────────────────────────────────────────
const allDeclaredTests = new Set(
  Object.values(existingTestsById).flatMap((s) => [...s])
);

const passingUnclaimed = manifest.filter((e) =>
  e.result === 'pass' && !allDeclaredTests.has(e.file)
);

for (const entry of passingUnclaimed) {
  warnings.push(`[FN-WARN] ${entry.file} (${entry.runner}) passes but is not declared in any subsystem existingTests`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧱 Boundary Smell
// Subsystem allowedFiles count > 5 (large surface)
// Subsystem with allowedFiles belonging to multiple domains
// ─────────────────────────────────────────────────────────────────────────────
for (const sub of ownerMap.subsystems ?? []) {
  const af = sub.allowedFiles ?? [];
  if (af.length > 5) {
    warnings.push(`[BOUNDARY] ${sub.id} ${sub.name}: allowedFiles.length=${af.length} exceeds 5 (large surface, harder to test precisely)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧪 Evidence Smell
// ─────────────────────────────────────────────────────────────────────────────

// E1 — test file in existingTests but does not exist on disk
for (const sub of ownerMap.subsystems ?? []) {
  for (const testFile of sub.existingTests ?? []) {
    const abs = resolve(ROOT, testFile);
    if (!existsSync(abs)) {
      criticals.push(`[EV-CRITICAL] ${sub.id}: existingTest file not found on disk: ${testFile}`);
    }
  }
}

// E2 — manifest entries with empty command
for (const entry of manifest) {
  if (!entry.command || entry.command.trim() === 'unavailable') {
    infos.push(`[EV-INFO] ${entry.file}: command is empty/unavailable (runner: ${entry.runner})`);
  }
}

// E3 — manifest entries with durationMs=0 and result=pass (suspicious)
const zeroDurationPass = manifest.filter((e) => e.result === 'pass' && e.durationMs === 0);
for (const entry of zeroDurationPass) {
  warnings.push(`[EV-WARN] ${entry.file}: result=pass with durationMs=0 (suspicious — may be cached or unexecuted)`);
}

// E4 — subsystem has requiredGuardCI but none of those guard files exist
for (const sub of ownerMap.subsystems ?? []) {
  for (const guard of sub.requiredGuardCI ?? []) {
    if (!existsSync(resolve(ROOT, guard))) {
      warnings.push(`[EV-WARN] ${sub.id} ${sub.name}: requiredGuardCI file not found: ${guard}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 📊 Matching diagnostics — BEFORE vs AFTER
// ─────────────────────────────────────────────────────────────────────────────

// "Before" matching: declared via existingTests only
const beforeAssociated   = manifest.filter((e) => allDeclaredTests.has(e.file)).length;
const afterAssociated    = totalAssociated; // M1–M6
const strongOnly         = manifest.filter((e) => {
  const tiers = matchTiers.get(e.file) ?? new Map();
  return [...tiers.values()].some((t) => t === 'strong');
}).length;
const declaredOnlyCount  = manifest.filter((e) => {
  const tiers = matchTiers.get(e.file) ?? new Map();
  return tiers.size > 0 && ![...tiers.values()].some((t) => t === 'strong');
}).length;

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────────────────────────────────────
console.log('── E2R Integrity Audit ──────────────────────────────────────────');
console.log('');

console.log('🚨 False Positive Risk');
if (fpRisks.length === 0) {
  console.log('   none detected');
} else {
  fpRisks.forEach((id) => console.log(`   ${id}`));
}
console.log('');

console.log('🧊 False Negative Risk');
if (passingUnclaimed.length === 0) {
  console.log('   none detected');
} else {
  passingUnclaimed.forEach((e) => console.log(`   ${e.file} (${e.runner})`));
}
console.log('');

console.log('🧱 Boundary Smell');
const boundaryWarns = warnings.filter((w) => w.startsWith('[BOUNDARY]'));
if (boundaryWarns.length === 0) {
  console.log('   none detected');
} else {
  boundaryWarns.forEach((w) => console.log(`   ${w}`));
}
console.log('');

console.log('🧪 Evidence Smell');
const evIssues = [...criticals.filter((c) => c.startsWith('[EV-')),
                  ...warnings.filter((w) => w.startsWith('[EV-')),
                  ...infos.filter((i) => i.startsWith('[EV-'))];
if (evIssues.length === 0) {
  console.log('   none detected');
} else {
  evIssues.forEach((e) => console.log(`   ${e}`));
}
console.log('');

console.log('📊 Matching Diagnostics');
console.log(`   total tests evaluated  : ${manifest.length}`);
console.log(`   BEFORE (existingTests) : ${beforeAssociated} associated`);
console.log(`   AFTER  (M1-M6)         : ${afterAssociated} associated`);
console.log(`     of which strong M1-M5: ${strongOnly}`);
console.log(`     of which declared M6 : ${declaredOnlyCount}`);
console.log(`   unassociated (no rule) : ${totalDiscarded}`);
console.log('');

// Summary
const totalIssues = criticals.length + warnings.length + infos.length;
console.log('── Summary ──────────────────────────────────────────────────────');
console.log(`   CRITICAL : ${criticals.length}`);
console.log(`   WARNING  : ${warnings.length}`);
console.log(`   INFO     : ${infos.length}`);
console.log('');

if (criticals.length > 0) {
  console.error('CRITICAL issues:');
  criticals.forEach((c) => console.error(`  ${c}`));
  console.error('');
}
if (warnings.length > 0) {
  console.log('Warnings:');
  warnings.filter((w) => !w.startsWith('[BOUNDARY]') && !w.startsWith('[EV-'))
          .forEach((w) => console.log(`  ${w}`));
  console.log('');
}
if (infos.length > 0) {
  console.log('Info:');
  infos.forEach((i) => console.log(`  ${i}`));
  console.log('');
}

if (criticals.length === 0 && warnings.length === 0 && infos.length === 0) {
  console.log('✅ E2R integrity: clean\n');
} else if (criticals.length === 0) {
  console.log('✅ E2R integrity: no critical issues\n');
} else {
  console.error('❌ E2R integrity: CRITICAL issues require attention\n');
}

process.exit(criticals.length > 0 ? 1 : 0);
