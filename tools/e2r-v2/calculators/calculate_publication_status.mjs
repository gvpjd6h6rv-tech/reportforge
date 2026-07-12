'use strict';
export function calculatePublicationStatus(input) { if (input.semanticScopeStatus !== 'COMPLETE' || input.ownershipStatus !== 'COMPLETE' || input.scoreObservabilityStatus !== 'COMPLETE' || !Number.isFinite(input.rawScore)) return 'PROVISIONAL'; return 'PUBLISHED'; }
