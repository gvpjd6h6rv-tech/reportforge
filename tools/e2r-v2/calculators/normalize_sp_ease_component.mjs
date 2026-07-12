'use strict';
export function normalizeSpEaseComponent(spTotalScore) { return Number.isFinite(spTotalScore) ? Math.max(0, Math.min(100, 100 - spTotalScore)) : 100; }
