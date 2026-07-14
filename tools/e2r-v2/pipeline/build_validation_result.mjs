'use strict';
const validateE2RReport = (await import('../validators/validate_e2r_report.mjs')).validateE2RReport;
const buildValidationSemanticChecks = (await import('./build_validation_semantic_checks.mjs')).buildValidationSemanticChecks;
const buildValidationGraphChecks = (await import('./build_validation_graph_checks.mjs')).buildValidationGraphChecks;
const buildValidationOwnershipChecks = (await import('./build_validation_ownership_checks.mjs')).buildValidationOwnershipChecks;
const validateCheckerContract = (await import('../validators/validate_checker_contract.mjs')).validateCheckerContract;
const calculateValidationStrictFailures = (await import('./calculate_validation_strict_failures.mjs')).calculateValidationStrictFailures;
export const buildValidationResult = (input) => {
  const schema = validateE2RReport(input?.report);
  const semanticChecks = buildValidationSemanticChecks(input);
  const graphChecks = buildValidationGraphChecks(input);
  const ownershipChecks = buildValidationOwnershipChecks(input);
  const contract = validateCheckerContract(Object.fromEntries([['semanticChecks', semanticChecks], ['graphChecks', graphChecks], ['ownershipChecks', ownershipChecks]]));
  const strictFailure = calculateValidationStrictFailures(Object.fromEntries([['schema', schema], ['checks', contract.checks]]));
  return Object.fromEntries([
    ['schema', schema],
    ['contract', contract],
    ['checks', contract.checks],
    ['strictFailure', strictFailure],
    ['strictFailures', strictFailure?.value ?? 0],
  ]);
};
