'use strict';

/** Flags a file whose owner lookup resolved to "unowned". */
export function checkOwnershipViolation(owner) {
  const value = owner === 'unowned';
  return { value, evidence: value ? ['owner=unowned'] : [] };
}
