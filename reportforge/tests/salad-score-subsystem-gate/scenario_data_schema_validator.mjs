'use strict';
/** SOLE owner of scenario-data/scenarios.json's structural contract. The
 *  materializer (fixture_materializer.mjs) stays neutral -- it knows
 *  nothing about required fields, presets, or scenario shape; it only
 *  materializes whatever {files, scopeMap, ownershipMap} it is handed.
 *  This validator is what would refuse a malformed scenarios.json BEFORE
 *  any test ever consumes it. Contract ID: SCENARIO-DATA-SCHEMA-01. */

const SCENARIO_ENTRY_KEYS = new Set(['relPath', 'content']);

function isScenarioEntry(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    && typeof v.relPath === 'string' && v.relPath.length > 0
    && typeof v.content === 'string';
}

function unknownKeys(obj, allowed) {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

export function validateScenarioData(raw) {
  const evidence = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: false, evidence: ['ROOT_NOT_OBJECT'] };
  }
  if (!('presets' in raw)) evidence.push('MISSING_REQUIRED_FIELD:presets');
  const seenRelPaths = new Set();

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'presets') continue;
    if (!isScenarioEntry(value)) {
      evidence.push(`SCENARIO_ENTRY_TYPE_INVALID:${key}`);
      continue;
    }
    const extra = unknownKeys(value, SCENARIO_ENTRY_KEYS);
    for (const k of extra) evidence.push(`UNKNOWN_FIELD:${key}.${k}`);
    if (seenRelPaths.has(value.relPath)) evidence.push(`DUPLICATE_REL_PATH:${value.relPath}`);
    seenRelPaths.add(value.relPath);
  }

  const presets = raw.presets && typeof raw.presets === 'object' ? raw.presets : {};
  for (const [name, preset] of Object.entries(presets)) {
    if (!preset || typeof preset !== 'object') { evidence.push(`PRESET_TYPE_INVALID:${name}`); continue; }
    if (!Array.isArray(preset.files)) evidence.push(`PRESET_MISSING_FIELD:${name}.files`);
    if (!preset.scopeMap || typeof preset.scopeMap !== 'object') evidence.push(`PRESET_INVALID_SCOPE_MAP:${name}`);
    if (!preset.ownershipMap || typeof preset.ownershipMap !== 'object') evidence.push(`PRESET_INVALID_OWNERSHIP_MAP:${name}`);
    for (const f of preset.files || []) {
      if (!isScenarioEntry(f)) evidence.push(`PRESET_FILE_TYPE_INVALID:${name}`);
    }
  }
  return { value: evidence.length === 0, evidence };
}
