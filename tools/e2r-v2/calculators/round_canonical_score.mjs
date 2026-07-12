'use strict';
export function roundCanonicalScore(value) { return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : value; }
