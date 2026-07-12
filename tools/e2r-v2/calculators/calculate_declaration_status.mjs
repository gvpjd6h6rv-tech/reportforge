'use strict';
export function calculateDeclarationStatus(input) { if (!input || input.scopeResolved === false) return 'MISSING'; if (input.empty) return 'EMPTY'; return 'RESOLVED'; }
