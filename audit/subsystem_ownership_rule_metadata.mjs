'use strict';

export function collectGuardErrors(subsystems) {
  const errors = [];

  for (const ss of subsystems) {
    if (ss.domain !== 'designer-runtime' || ss.tier !== 'core') continue;
    const hasGuard = Array.isArray(ss.requiredGuardCI) && ss.requiredGuardCI.length > 0;
    const hasJustification = typeof ss.notes === 'string' && ss.notes.toLowerCase().includes('justification:');
    if (!hasGuard && !hasJustification) {
      errors.push({ rule: 'RULE-GUARD', subsystem: ss.id, file: null, detail: `core subsystem "${ss.id}" (${ss.name}) has no requiredGuardCI and no "justification:" in notes` });
    }
  }

  return errors;
}

export function collectSchemaErrors(subsystems) {
  const errors = [];
  const REQUIRED_FIELDS = [
    'id', 'name', 'domain', 'tier', 'owner',
    'allowedFiles', 'legacyFiles',
    'writableState', 'selectors', 'events',
    'existingTests', 'requiredGuardCI',
    'risk', 'notes', 'unresolvedAmbiguities',
  ];

  for (const ss of subsystems) {
    for (const field of REQUIRED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(ss, field)) {
        errors.push({ rule: 'RULE-SCHEMA', subsystem: ss.id || '(unknown)', file: null, detail: `subsystem "${ss.id || '?'}" missing required field: ${field}` });
      }
    }
    if (ss.domain !== 'designer-runtime' && ss.domain !== 'backend-render') {
      errors.push({ rule: 'RULE-SCHEMA', subsystem: ss.id, file: null, detail: `subsystem "${ss.id}" has invalid domain "${ss.domain}" — must be "designer-runtime" or "backend-render"` });
    }
    if (ss.tier !== 'core' && ss.tier !== 'supporting') {
      errors.push({ rule: 'RULE-SCHEMA', subsystem: ss.id, file: null, detail: `subsystem "${ss.id}" has invalid tier "${ss.tier}" — must be "core" or "supporting"` });
    }
  }

  return errors;
}
