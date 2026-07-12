'use strict';
export function classifyScoreBand(value) { if (!Number.isFinite(value)) return 'RED'; if (value >= 80) return 'GREEN'; if (value >= 50) return 'YELLOW'; return 'RED'; }
