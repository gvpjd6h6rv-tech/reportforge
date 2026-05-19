#!/usr/bin/env node
/**
 * E2R Guard — Anti-degradation enforcement gate
 *
 * Inputs:
 *   audit/e2r_coverage.json        — current coverage state
 *   audit/e2r_baseline.json        — approved snapshot baseline
 *   audit/subsystem_ownership_map.json — subsystem definitions
 *
 * Gate rules:
 *   R1. Band degradation: green→yellow/red or yellow→red → FAIL
 *   R2. coverageReal drop > 5 points vs baseline → FAIL
 *   R3. New subsystem without owner/coverageReal/risk/requiredGuardCI → FAIL
 *   R4. Core subsystem with coverageReal=0 and no coverageExclusion → FAIL
 *   R5. BACKLOG exclusion → WARNING only, never FAIL
 *
 * Band thresholds (deterministic):
 *   green:  coverageReal >= 5
 *   yellow: coverageReal  1-4
 *   red:    coverageReal == 0  (no exclusion)
 *   backlog: coverageReal == 0 (has coverageExclusion)
 *
 * Exits 0 if no violations. Exits 1 if any FAIL rule triggered.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const coverage   = JSON.parse(readFileSync(resolve(__dirname, 'e2r_coverage.json'),           'utf8'));
const baseline   = JSON.parse(readFileSync(resolve(__dirname, 'e2r_baseline.json'),           'utf8'));
const ownerMap   = JSON.parse(readFileSync(resolve(__dirname, 'subsystem_ownership_map.json'),'utf8'));

// ── Band helper ───────────────────────────────────────────────────────────────
function toBand(coverageReal, hasExclusion) {
  if (coverageReal >= 5)  return 'green';
  if (coverageReal >= 1)  return 'yellow';
  return hasExclusion ? 'backlog' : 'red';
}

const BAND_ORDER = { green: 2, yellow: 1, red: 0, backlog: null }; // backlog = exempt

function isDegradation(prevBand, currBand) {
  // backlog is never a degradation
  if (prevBand === 'backlog' || currBand === 'backlog') return false;
  const prev = BAND_ORDER[prevBand] ?? 0;
  const curr = BAND_ORDER[currBand] ?? 0;
  return curr < prev;
}

// ── Index helpers ─────────────────────────────────────────────────────────────
const baselineById  = Object.fromEntries(baseline.subsystems.map((s) => [s.id, s]));
const ownerById     = Object.fromEntries((ownerMap.subsystems ?? []).map((s) => [s.id, s]));
const currentSubs   = coverage.subsystems;

const failures = [];
const warnings = [];

// ── R1 + R2: per-subsystem band and numeric checks ────────────────────────────
for (const curr of currentSubs) {
  const hasExcl   = Boolean(curr.coverageExclusion);
  const currBand  = toBand(curr.coverageReal, hasExcl);
  const base      = baselineById[curr.id];

  // R5: BACKLOG warning
  if (hasExcl) {
    warnings.push(`[BACKLOG] ${curr.id} ${curr.name}: ${curr.coverageExclusion.reason} — ${curr.coverageExclusion.justification?.slice(0, 80)}...`);
  }

  if (!base) {
    // New subsystem — handled by R3 below
    continue;
  }

  // R1: band degradation
  const prevBand = base.band;
  if (isDegradation(prevBand, currBand)) {
    failures.push(`[R1-BAND] ${curr.id} ${curr.name}: band degraded ${prevBand} → ${currBand} (coverageReal ${base.coverageReal} → ${curr.coverageReal})`);
  }

  // R2: numeric drop > 5
  const drop = base.coverageReal - curr.coverageReal;
  if (drop > 5) {
    failures.push(`[R2-DROP] ${curr.id} ${curr.name}: coverageReal dropped ${base.coverageReal} → ${curr.coverageReal} (Δ=${drop}, limit=5)`);
  }
}

// ── R3: new subsystems missing required fields ────────────────────────────────
for (const curr of currentSubs) {
  if (baselineById[curr.id]) continue; // not new
  const owner = ownerById[curr.id];
  const missing = [];
  if (!owner)                                              missing.push('owner entry in ownership_map');
  if (curr.coverageReal == null)                           missing.push('coverageReal');
  if (!curr.risk)                                          missing.push('risk');
  if (!owner?.requiredGuardCI?.length)                     missing.push('requiredGuardCI');
  if (missing.length > 0) {
    failures.push(`[R3-NEW] ${curr.id} ${curr.name}: new subsystem missing: ${missing.join(', ')}`);
  }
}

// ── R4: core subsystems with coverageReal=0 and no exclusion ─────────────────
for (const curr of currentSubs) {
  const owner = ownerById[curr.id];
  if (!owner) continue;
  if (owner.tier !== 'core') continue;
  if (curr.coverageReal === 0 && !curr.coverageExclusion) {
    failures.push(`[R4-CORE-ZERO] ${curr.id} ${curr.name}: core subsystem has coverageReal=0 with no coverageExclusion justification`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log('── E2R Guard ────────────────────────────────────────────────────');
console.log(`   baseline:  ${baseline.generatedAt}`);
console.log(`   evaluated: ${coverage.generatedAt}`);
console.log(`   subsystems: ${currentSubs.length} current | ${baseline.subsystems.length} in baseline`);
console.log(`   passing tests: ${baseline.totalPassingTests} → ${coverage.totalPassingTests}`);
console.log('');

if (warnings.length > 0) {
  console.log('  Warnings (BACKLOG — not blocking):');
  warnings.forEach((w) => console.log(`    ${w}`));
  console.log('');
}

if (failures.length === 0) {
  console.log(`✅ E2R guard: 0 degradations detected across ${currentSubs.length} subsystems\n`);
  process.exit(0);
}

console.error(`❌ E2R guard: ${failures.length} degradation(s) detected\n`);
failures.forEach((f) => console.error(`    ${f}`));
console.error('');
process.exit(1);
