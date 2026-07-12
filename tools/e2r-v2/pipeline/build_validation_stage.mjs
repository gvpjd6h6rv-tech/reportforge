'use strict';
import { validateE2RReport } from '../validators/validate_e2r_report.mjs';
import { checkMissingClassification } from '../checkers/check_missing_classification.mjs';
import { checkMapEntryNonexistentFile } from '../checkers/check_map_entry_nonexistent_file.mjs';
import { checkDuplicateClassification } from '../checkers/check_duplicate_classification.mjs';
import { checkSemanticRuleCompleteness } from '../checkers/check_semantic_rule_completeness.mjs';
import { checkEvidenceCompleteness } from '../checkers/check_evidence_completeness.mjs';
import { checkDependentMemberEdge } from '../checkers/check_dependent_member_edge.mjs';
import { checkExcludedNewGeometrySignal } from '../checkers/check_excluded_new_geometry_signal.mjs';
import { checkOwnershipJoinConsistency } from '../checkers/check_ownership_join_consistency.mjs';
import { checkSharedCanonicalOwner } from '../checkers/check_shared_canonical_owner.mjs';
import { checkBfsMapDrift } from '../checkers/check_bfs_map_drift.mjs';
import { checkCoverageOwnershipIdAlignment } from '../checkers/check_coverage_ownership_id_alignment.mjs';
export function buildValidationStage({ report, inventory, evidence }) { const schema = validateE2RReport(report); const checks = { missingClassification: checkMissingClassification(inventory.physical.map((f) => f.relative), report.capabilityMap), nonexistentMapEntry: checkMapEntryNonexistentFile(report.root, report.capabilityMap), duplicateClassification: checkDuplicateClassification(report.capabilityMap), semanticRuleCompleteness: checkSemanticRuleCompleteness(report.capabilityMap), evidenceCompleteness: checkEvidenceCompleteness(report.capabilityMap), dependentMemberEdge: checkDependentMemberEdge(report.capabilityMap, evidence.moduleEdges.flatMap((row) => row.edges || [])), excludedNewGeometrySignal: checkExcludedNewGeometrySignal(report.capabilityMap, evidence.moduleEdges.flatMap((row) => row.edges || [])), ownershipJoinConsistency: checkOwnershipJoinConsistency(inventory.ownership.rows), sharedCanonicalOwner: checkSharedCanonicalOwner(inventory.ownership.rows), bfsMapDrift: checkBfsMapDrift(report.bfsCandidates || [], report.reviewedBfsCandidates || []), coverageOwnershipIdAlignment: checkCoverageOwnershipIdAlignment(report.scopeMap || {}, report.ownershipMap || {}, report.coverageOwnershipIdExceptions || {}), }; const strictFailures = Object.values(checks).filter((check) => !check.value).length; return { schema, checks, strictFailures }; }
