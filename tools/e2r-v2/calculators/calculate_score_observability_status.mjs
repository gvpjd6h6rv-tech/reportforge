'use strict';
export function calculateScoreObservabilityStatus(input) { const count = Number(input?.count || 0); if (!count) return 'NOT_OBSERVABLE'; if (input?.partial) return 'PARTIAL'; return 'COMPLETE'; }
