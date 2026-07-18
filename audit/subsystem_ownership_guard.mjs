#!/usr/bin/env node
/**
 * audit/subsystem_ownership_guard.mjs — Subsystem ownership compliance gate
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateOwnershipMap } from './subsystem_ownership_checks.mjs';

export { checkFilesExist } from './subsystem_ownership_rule_paths.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAP_REL = 'audit/subsystem_ownership_map.json';
const MAP_ABS = join(ROOT, MAP_REL);
const SEP = '─'.repeat(70);

function printReport({ errors, warnings, diskFiles, index, subsystems }) {
  console.log(`\n${SEP}`);
  console.log('📦  Subsystem Ownership Guard');
  console.log(`    map: ${MAP_REL}  |  subsystems: ${subsystems.length}  |  engines/: ${diskFiles.size} files`);
  console.log(SEP);

  if (errors.length > 0) {
    console.log(`\n❌  FAIL — ${errors.length} violation(s)\n`);
    for (const e of errors) {
      const loc = e.file ? `  file    : ${e.rule === 'RULE-EXIST' && !String(e.file).includes('/') ? `engines/${e.file}` : e.file}` : '';
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
      const fileCount = (ss.allowedFiles || []).length + (ss.allowedPaths || []).length;
      const guardCount = (ss.requiredGuardCI || []).length;
      const ambigCount = (ss.unresolvedAmbiguities || []).length;
      const mark = ss.tier === 'core' ? '🔴' : '🔵';
      console.log(
        `  ${mark}  ${ss.id.padEnd(8)} ${ss.name.padEnd(30)} tier:${ss.tier.padEnd(10)} ` +
        `files:${String(fileCount).padStart(3)}  guards:${guardCount}  ambig:${ambigCount}`
      );
    }
  }

  const claimedCount = new Set([...index.claims.keys()].filter((k) => k.startsWith('engines/'))).size;
  const orphanCount = warnings.filter((w) => w.rule === 'RULE-ORPHAN').length;
  console.log(`\n${SEP}`);
  console.log(`📊  Coverage: ${claimedCount} / ${diskFiles.size} engine files claimed` +
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

function main() {
  let map;
  try {
    map = JSON.parse(readFileSync(MAP_ABS, 'utf8'));
  } catch (e) {
    console.error(`[ownership-guard] Cannot read ${MAP_REL}: ${e.message}`);
    process.exit(1);
    return;
  }

  const { subsystems = [] } = map;
  if (!Array.isArray(subsystems) || subsystems.length === 0) {
    console.error('[ownership-guard] subsystems array is empty or missing.');
    process.exit(1);
    return;
  }

  const result = evaluateOwnershipMap({ ownershipMap: map, root: ROOT });
  printReport({ ...result, subsystems });
}

const isMain = process.argv[1] && process.argv[1].endsWith('subsystem_ownership_guard.mjs');
if (isMain) main();

export default { main };
