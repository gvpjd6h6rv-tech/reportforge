'use strict';
import { normalizeSpEaseComponent } from './normalize_sp_ease_component.mjs';
export function calculateFileScoreRaw({ spTotalScore, testEvidenceScore }) { const spEaseComponent = normalizeSpEaseComponent(spTotalScore); if (!Number.isFinite(testEvidenceScore)) return { status: 'NOT_OBSERVABLE', raw: null, spEaseComponent }; return { status: 'NUMERIC', raw: 0.75 * spEaseComponent + 0.25 * testEvidenceScore, spEaseComponent }; }
