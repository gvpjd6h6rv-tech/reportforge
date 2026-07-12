'use strict';
import fs from 'node:fs';
import { collectSubsystemScope } from '../collectors/collect_subsystem_scope.mjs';
import { resolveDeclaredPaths } from '../collectors/resolve_declared_paths.mjs';
import { checkSubsystemIdKnown } from '../checkers/check_subsystem_id_known.mjs';
import { runScopeChecks } from './run_scope_checks.mjs';
import { runScoreableScan } from './run_scoreable_scan.mjs';
import { checkNoOwnershipViolations } from '../checkers/check_no_ownership_violations.mjs';
import { checkNonScoreableOwnership } from '../checkers/check_non_scoreable_ownership.mjs';
import { checkNoHiddenSideEffectsInScope } from '../checkers/check_no_hidden_side_effects_in_scope.mjs';
import { checkNoFilesOver20 } from '../checkers/check_no_files_over_20.mjs';
import { checkOwnerInSubsystem } from '../checkers/check_owner_in_subsystem.mjs';
import { resolveSubsystemScore } from '../scoring/resolve_subsystem_score.mjs';
import { buildSubsystemResult } from './build_subsystem_result.mjs';
import { contractSubsystemResult } from '../contracts/contract_subsystem_result.mjs';

/** Orchestration only: official scorer -> scope resolution -> checkers in a
 *  fixed order -> result -> self-validate against the result contract. */
export function runSubsystemGate({ root, config, ownershipMapPath, scopeMapPath, subsystemId }) {
  const scopeRaw = collectSubsystemScope(scopeMapPath, subsystemId);
  const idKnown = checkSubsystemIdKnown(subsystemId, scopeRaw);
  const { scoreableRelative, scoreableFiles, nonScoreableRelative, allOwnedRelative, structuralOnly, allowedOwners } = resolveDeclaredPaths(scopeRaw, idKnown, root);

  const scopeChecks = runScopeChecks(root, allOwnedRelative, scoreableRelative, nonScoreableRelative, structuralOnly);
  const { scoreableScanned, scopedResults, scannedScoreablePaths } = runScoreableScan(root, config, ownershipMapPath, scoreableFiles);

  const ownershipMap = JSON.parse(fs.readFileSync(ownershipMapPath, 'utf8'));
  const remainingChecks = {
    noOwnershipViolations: checkNoOwnershipViolations(scopedResults),
    nonScoreableOwnership: checkNonScoreableOwnership(root, nonScoreableRelative, ownershipMap),
    noHiddenSideEffectsInScope: checkNoHiddenSideEffectsInScope(scopedResults),
    noFilesOver20: checkNoFilesOver20(scopedResults),
    ownerInSubsystem: checkOwnerInSubsystem(scopedResults, allowedOwners),
  };

  const subsystemScore = resolveSubsystemScore(structuralOnly, scoreableRelative, scopedResults);

  const result = buildSubsystemResult({
    subsystemId, allOwnedFiles: allOwnedRelative, scoreableFiles: scoreableRelative, nonScoreableFiles: nonScoreableRelative,
    scannedScoreablePaths, scopedResults,
    checks: { subsystemIdKnown: idKnown, ...scopeChecks, scoreableFilesScanned: scoreableScanned, ...remainingChecks },
    subsystemScore,
  });

  const selfCheck = contractSubsystemResult(result);
  if (!selfCheck.value) throw new Error(`INTERNAL_CONTRACT_VIOLATION: ${JSON.stringify(selfCheck.evidence)}`);
  return result;
}
