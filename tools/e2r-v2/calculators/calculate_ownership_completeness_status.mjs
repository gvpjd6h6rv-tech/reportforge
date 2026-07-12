'use strict';
export function calculateOwnershipCompletenessStatus(rows = []) { const states = rows.map((row) => row.ownerState); if (states.includes('CONFLICT') || states.includes('PATH_AMBIGUOUS')) return 'INVALID'; if (states.includes('UNOWNED') || states.includes('SHARED_UNRESOLVED')) return 'PARTIAL'; return 'COMPLETE'; }
