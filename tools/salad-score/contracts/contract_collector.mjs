'use strict';
/** Shape every collectors/*.mjs module must return: string, string[], or null. */
export function isValidCollectorOutput(value) {
  return value === null
    || typeof value === 'string'
    || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}
