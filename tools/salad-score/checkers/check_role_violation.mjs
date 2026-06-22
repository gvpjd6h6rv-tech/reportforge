'use strict';

const FORBIDDEN_BY_TYPE = {
  guard: ['dom-mutation'],
  config: ['business-logic', 'event-wiring'],
};

/** Flags when a detected responsibility category contradicts the file's declared type. */
export function checkRoleViolation(fileType, responsibilities) {
  const forbidden = FORBIDDEN_BY_TYPE[fileType] || [];
  const hits = responsibilities.filter((r) => forbidden.includes(r));
  return { value: hits.length > 0, evidence: hits };
}
