'use strict';

/** Maps a sp_total_score (0-100) to its level label per the configured levelScale. */
export function classifyLevel(totalScore, levelScale) {
  const entry = levelScale.find((l) => totalScore >= l.min && totalScore <= l.max);
  return entry ? entry.level : 'desconocido';
}
