'use strict';
/** Contract ID: SCENARIO-DATA-PRESET-EXISTS-01. Single gate key. RULE: a
 *  requested preset name must exist in scenario-data/scenarios.json's
 *  `presets` object -- a distinct failure mode from a structurally
 *  malformed preset (see scenario_data_schema_validator.mjs). */
export function checkPresetExists(presets, presetName) {
  const exists = !!presets && Object.prototype.hasOwnProperty.call(presets, presetName);
  return { value: exists, evidence: exists ? [] : [`PRESET_NOT_FOUND:${presetName}`] };
}
