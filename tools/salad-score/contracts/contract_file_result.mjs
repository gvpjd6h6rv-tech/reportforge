'use strict';
/** The final per-file output shape produced by runner/run_salad_score.mjs. */
const REQUIRED_FIELDS = [
  'path', 'owner', 'file_type', 'loc', 'responsibilities_detected',
  'sp_file_score', 'sp_behavior_score', 'sp_total_score', 'level',
  'reasons', 'suggested_split', 'violated_rules', 'evidence',
];

const IS_ARRAY = Array.isArray;
const IS_NUMBER = (v) => typeof v === 'number';
const IS_REASONS_ARRAY = (v) => IS_ARRAY(v) && v.every(isValidReasonEntry);

const FIELD_VALIDATORS = {
  responsibilities_detected: IS_ARRAY,
  sp_file_score: IS_NUMBER,
  sp_behavior_score: IS_NUMBER,
  sp_total_score: IS_NUMBER,
  reasons: IS_REASONS_ARRAY,
  suggested_split: IS_ARRAY,
  violated_rules: IS_ARRAY,
  evidence: IS_ARRAY,
};

function isValidReasonEntry(r) {
  return 'rule' in r && 'message' in r && Array.isArray(r.evidence);
}

function hasAllRequiredFields(result) {
  return REQUIRED_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(result, field));
}

function passesAllFieldValidators(result) {
  return Object.entries(FIELD_VALIDATORS).every(([field, validate]) => validate(result[field]));
}

export function isValidFileResult(result) {
  return !!result && hasAllRequiredFields(result) && passesAllFieldValidators(result);
}

export { REQUIRED_FIELDS };
