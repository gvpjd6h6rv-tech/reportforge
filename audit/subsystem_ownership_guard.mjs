#!/usr/bin/env node
/**
 * audit/subsystem_ownership_guard.mjs — Subsystem ownership compliance gate
 *
 * Validates audit/subsystem_ownership_map.json against three hard rules:
 *
 *   RULE-EXIST   Every allowedFile must exist on disk (engines/<file>),
 *                checked for EVERY domain (P29B — previously scoped to
 *                designer-runtime only; backend-render's allowedFiles are
 *                all intentionally empty today by design, so this widening
 *                is structural, not a behavior change on current data).
 *   RULE-OVERLAP No JS file may appear in more than one subsystem's allowedFiles
 *                unless listed in the top-level sharedFiles array.
 *   RULE-GUARD   Every core-tier subsystem in the designer-runtime domain must
 *                have at least one requiredGuardCI entry OR a non-empty notes
 *                field containing the word "justification:".
 *   RULE-ORPHAN  Every .js file in engines/ must appear in exactly one
 *                subsystem's allowedFiles (or sharedFiles).
 *
 * Exit 0 = PASS. Exit 1 = FAIL.
 *
 * ⚠  INTERNAL — CI entry point: npm run test:ownership
 *    Do not run standalone in CI; the npm script is the gate.
 */

import { readFileSync, readdirSync }   from 'node:fs';
import { join, extname }               from 'node:path';
import { fileURLToPath }                       from 'node:url';

const ROOT    = fileURLToPath(new URL('..', import.meta.url));
const MAP_REL = 'audit/subsystem_ownership_map.json';
const MAP_ABS = join(ROOT, MAP_REL);
const ENG_DIR = join(ROOT, 'engines');
const SEP     = '─'.repeat(70);

// ── RULE-EXIST (pure, exported for unit tests) ──────────────────────────────
// Every allowedFile must exist on disk, regardless of domain (P29B).
export function checkFilesExist(subsystems, diskFiles) {
  const errors = [];
  for (const ss of subsystems) {
    for (const f of (ss.allowedFiles || [])) {
      if (!diskFiles.has(f)) {
        errors.push({
          rule: 'RULE-EXIST',
          subsystem: ss.id,
          file: f,
          detail: `engines/${f} does not exist on disk`,
        });
      }
    }
  }
  return errors;
}

// ── CLI ──────────────────────────────────────────────────────────────────

function main() {
  // ── Load map ────────────────────────────────────────────────────────────
  let map;
  try {
    map = JSON.parse(readFileSync(MAP_ABS, 'utf8'));
  } catch (e) {
    console.error(`[ownership-guard] Cannot read ${MAP_REL}: ${e.message}`);
    process.exit(1);
    return;
  }

  const { subsystems = [], sharedFiles = [] } = map;

  if (!Array.isArray(subsystems) || subsystems.length === 0) {
    console.error('[ownership-guard] subsystems array is empty or missing.');
    process.exit(1);
    return;
  }

  // ── Collect all .js files on disk in engines/ ────────────────────────────
  const diskFiles = new Set();
  try {
    for (const entry of readdirSync(ENG_DIR, { withFileTypes: true })) {
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.js') {
        diskFiles.add(entry.name);
      }
    }
  } catch (e) {
    console.error(`[ownership-guard] Cannot read engines/ directory: ${e.message}`);
    process.exit(1);
    return;
  }

  // ── Build index structures ────────────────────────────────────────────────
  const fileToSubsystems = new Map();
  for (const ss of subsystems) {
    for (const f of (ss.allowedFiles || [])) {
      if (!fileToSubsystems.has(f)) fileToSubsystems.set(f, []);
      fileToSubsystems.get(f).push(ss.id);
    }
  }

  const sharedSet = new Set(sharedFiles);

  // ── Validation ────────────────────────────────────────────────────────────
  const errors   = [];   // FAIL
  const warnings = [];   // WARN (non-blocking)

  // RULE-EXIST: every allowedFile must exist on disk (all domains, P29B)
  errors.push(...checkFilesExist(subsystems, diskFiles));

  // RULE-OVERLAP: no JS file in two subsystems unless in sharedFiles
  for (const [file, ids] of fileToSubsystems.entries()) {
    if (ids.length > 1 && !sharedSet.has(file)) {
      errors.push({
        rule: 'RULE-OVERLAP',
        subsystem: ids.join(', '),
        file,
        detail: `engines/${file} claimed by multiple subsystems: [${ids.join(', ')}]. Add to sharedFiles if intentional.`,
      });
    }
  }

  // RULE-GUARD: core designer-runtime subsystems must have CI guard or justification
  for (const ss of subsystems) {
    if (ss.domain !== 'designer-runtime') continue;
    if (ss.tier !== 'core') continue;
    const hasGuard = Array.isArray(ss.requiredGuardCI) && ss.requiredGuardCI.length > 0;
    const hasJustification = typeof ss.notes === 'string' &&
      ss.notes.toLowerCase().includes('justification:');
    if (!hasGuard && !hasJustification) {
      errors.push({
        rule: 'RULE-GUARD',
        subsystem: ss.id,
        file: null,
        detail: `core subsystem "${ss.id}" (${ss.name}) has no requiredGuardCI and no "justification:" in notes`,
      });
    }
  }

  // RULE-ORPHAN: every .js in engines/ must be claimed by exactly one subsystem
  // (or be in sharedFiles, which is fine)
  for (const f of diskFiles) {
    const ids = fileToSubsystems.get(f) || [];
    const inShared = sharedSet.has(f);
    if (ids.length === 0 && !inShared) {
      warnings.push({
        rule: 'RULE-ORPHAN',
        file: f,
        detail: `engines/${f} is not claimed by any subsystem — add to an allowedFiles list`,
      });
    }
  }

  // Required field presence check
  const REQUIRED_FIELDS = [
    'id', 'name', 'domain', 'tier', 'owner',
    'allowedFiles', 'legacyFiles',
    'writableState', 'selectors', 'events',
    'existingTests', 'requiredGuardCI',
    'risk', 'notes', 'unresolvedAmbiguities',
  ];

  for (const ss of subsystems) {
    for (const field of REQUIRED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(ss, field)) {
        errors.push({
          rule: 'RULE-SCHEMA',
          subsystem: ss.id || '(unknown)',
          file: null,
          detail: `subsystem "${ss.id || '?'}" missing required field: ${field}`,
        });
      }
    }
    if (ss.domain !== 'designer-runtime' && ss.domain !== 'backend-render') {
      errors.push({
        rule: 'RULE-SCHEMA',
        subsystem: ss.id,
        file: null,
        detail: `subsystem "${ss.id}" has invalid domain "${ss.domain}" — must be "designer-runtime" or "backend-render"`,
      });
    }
    if (ss.tier !== 'core' && ss.tier !== 'supporting') {
      errors.push({
        rule: 'RULE-SCHEMA',
        subsystem: ss.id,
        file: null,
        detail: `subsystem "${ss.id}" has invalid tier "${ss.tier}" — must be "core" or "supporting"`,
      });
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('📦  Subsystem Ownership Guard');
  console.log(`    map: ${MAP_REL}  |  subsystems: ${subsystems.length}  |  engines/: ${diskFiles.size} files`);
  console.log(SEP);

  if (errors.length > 0) {
    console.log(`\n❌  FAIL — ${errors.length} violation(s)\n`);
    for (const e of errors) {
      const loc = e.file ? `  file    : engines/${e.file}` : '';
      console.log(`  ❌  [${e.rule}]  subsystem: ${e.subsystem}`);
      if (loc) console.log(loc);
      console.log(`      detail  : ${e.detail}\n`);
    }
  }

  if (warnings.length > 0) {
    console.log(`⚠   WARN — ${warnings.length} orphan(s)\n`);
    for (const w of warnings) {
      console.log(`  ⚠   [${w.rule}]  ${w.detail}`);
    }
    console.log('');
  }

  // ── Per-subsystem summary ─────────────────────────────────────────────────
  console.log(`${SEP}`);
  console.log('📋  Subsystem inventory');
  console.log(SEP);

  const byDomain = {};
  for (const ss of subsystems) {
    if (!byDomain[ss.domain]) byDomain[ss.domain] = [];
    byDomain[ss.domain].push(ss);
  }

  for (const [domain, ssList] of Object.entries(byDomain)) {
    console.log(`\n  Domain: ${domain}`);
    for (const ss of ssList) {
      const fileCount = (ss.allowedFiles || []).length;
      const guardCount = (ss.requiredGuardCI || []).length;
      const ambigCount = (ss.unresolvedAmbiguities || []).length;
      const mark = ss.tier === 'core' ? '🔴' : '🔵';
      console.log(
        `  ${mark}  ${ss.id.padEnd(8)} ${ss.name.padEnd(30)} tier:${ss.tier.padEnd(10)} ` +
        `files:${String(fileCount).padStart(3)}  guards:${guardCount}  ambig:${ambigCount}`
      );
    }
  }

  // ── Coverage summary ───────────────────────────────────────────────────────
  const totalClaimed = new Set(
    subsystems.flatMap(ss => ss.domain === 'designer-runtime' ? (ss.allowedFiles || []) : [])
  );
  const orphanCount = warnings.filter(w => w.rule === 'RULE-ORPHAN').length;

  console.log(`\n${SEP}`);
  console.log(`📊  Coverage: ${totalClaimed.size} / ${diskFiles.size} engine files claimed` +
    (orphanCount > 0 ? ` (${orphanCount} orphans)` : ' (all claimed)'));
  console.log(SEP);

  if (errors.length === 0) {
    console.log('✅  PASS — all ownership rules satisfied.');
    console.log(SEP + '\n');
    process.exitCode = 0;
  } else {
    console.log(`❌  FAIL — fix ${errors.length} violation(s) above.`);
    console.log(SEP + '\n');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('subsystem_ownership_guard.mjs');
if (isMain) main();
