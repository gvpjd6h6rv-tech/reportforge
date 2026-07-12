'use strict';
import { checkSubsystemScopeNonempty } from '../checkers/check_subsystem_scope_nonempty.mjs';
import { checkScopeHasScoreableFiles } from '../checkers/check_scope_has_scoreable_files.mjs';
import { checkNoDuplicateScopePaths } from '../checkers/check_no_duplicate_scope_paths.mjs';
import { checkNoDuplicateAcrossScoreablePartitions } from '../checkers/check_no_duplicate_across_scoreable_partitions.mjs';
import { checkAllOwnedFilesComplete } from '../checkers/check_all_owned_files_complete.mjs';
import { checkNoScopePathEscape } from '../checkers/check_no_scope_path_escape.mjs';
import { collectPathExistence } from '../collectors/collect_path_existence.mjs';
import { checkNonScoreableFilesExist } from '../checkers/check_non_scoreable_files_exist.mjs';

/** Runs the pre-scan scope-structure checks (nonempty, completeness,
 *  duplicates [in all three declared lists], escape, non-scoreable
 *  existence) as one grouped step of the orchestration -- single
 *  responsibility: pre-scan scope validation. `checkNoDuplicateScopePaths`
 *  is a generic single-array rule reused three times (scoreable,
 *  non-scoreable, allOwned) under three distinct gate keys -- not three
 *  separate rules. */
export function runScopeChecks(root, allOwnedRelative, scoreableRelative, nonScoreableRelative, structuralOnly) {
  return {
    scopeNonempty: checkSubsystemScopeNonempty(allOwnedRelative),
    hasScoreable: checkScopeHasScoreableFiles(scoreableRelative, structuralOnly),
    noDuplicateScopePaths: checkNoDuplicateScopePaths(scoreableRelative),
    noDuplicateNonScoreablePaths: checkNoDuplicateScopePaths(nonScoreableRelative),
    noDuplicateAllOwnedPaths: checkNoDuplicateScopePaths(allOwnedRelative),
    noCrossPartitionDuplicates: checkNoDuplicateAcrossScoreablePartitions(scoreableRelative, nonScoreableRelative),
    allOwnedFilesComplete: checkAllOwnedFilesComplete(allOwnedRelative, scoreableRelative, nonScoreableRelative),
    noScopePathEscape: checkNoScopePathEscape(allOwnedRelative),
    nonScoreableFilesExist: checkNonScoreableFilesExist(collectPathExistence(root, nonScoreableRelative)),
  };
}
