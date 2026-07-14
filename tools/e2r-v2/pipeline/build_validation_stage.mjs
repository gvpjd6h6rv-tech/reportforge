'use strict';
const buildValidationResult = (await import('./build_validation_result.mjs')).buildValidationResult;
export const buildValidationStage = (input) => buildValidationResult(input);
