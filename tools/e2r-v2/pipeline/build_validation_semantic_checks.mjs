'use strict';
const checkMissingClassification = (await import('../checkers/check_missing_classification.mjs')).checkMissingClassification;
const checkDuplicateClassification = (await import('../checkers/check_duplicate_classification.mjs')).checkDuplicateClassification;
const checkSemanticRuleCompleteness = (await import('../checkers/check_semantic_rule_completeness.mjs')).checkSemanticRuleCompleteness;
const checkEvidenceCompleteness = (await import('../checkers/check_evidence_completeness.mjs')).checkEvidenceCompleteness;
export const buildValidationSemanticChecks = (input) => Object.fromEntries([
  ['missingClassification', checkMissingClassification(Object.fromEntries([['capabilityMap', input?.report?.capabilityMap], ['physicalPaths', (input?.inventory?.physical || []).map((file) => file.relative)]]))],
  ['duplicateClassification', checkDuplicateClassification(Object.fromEntries([['capabilityMap', input?.report?.capabilityMap]]))],
  ['semanticRuleCompleteness', checkSemanticRuleCompleteness(Object.fromEntries([['capabilityMap', input?.report?.capabilityMap]]))],
  ['evidenceCompleteness', checkEvidenceCompleteness(Object.fromEntries([['capabilityMap', input?.report?.capabilityMap]]))],
]);
