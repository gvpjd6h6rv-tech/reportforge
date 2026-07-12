'use strict';
export function calculateFileScoreFinal(input) { if (!input || !['RESOLVED', 'SHARED_RESOLVED'].includes(input.ownershipStatus)) return { status: 'NOT_APPLICABLE', value: null }; if (!input.spObservable || !input.testEvidenceObservable) return { status: 'NOT_APPLICABLE', value: null }; return { status: 'NUMERIC', value: input.rawScore }; }
