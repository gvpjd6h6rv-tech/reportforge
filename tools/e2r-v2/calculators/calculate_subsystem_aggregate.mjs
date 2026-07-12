'use strict';
export function calculateSubsystemAggregate(scores = []) { const values = scores.filter((n) => Number.isFinite(n)); if (!values.length) return { status: 'NOT_OBSERVABLE', value: null, count: 0 }; return { status: 'COMPLETE', value: values.reduce((a, b) => a + b, 0) / values.length, count: values.length }; }
