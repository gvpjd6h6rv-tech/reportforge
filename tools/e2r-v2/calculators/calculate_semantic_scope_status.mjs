'use strict';
export function calculateSemanticScopeStatus(input) { if (input?.invalid) return 'INVALID'; if (input?.missing || input?.nonexistent || input?.duplicates) return 'PARTIAL'; return 'COMPLETE'; }
