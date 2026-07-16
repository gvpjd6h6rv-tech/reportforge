'use strict';

export function calculateCapabilityAggregate(
  scores = [],
  expectedCount = scores.length,
) {
  const values = scores
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const n = values.length;
  const expected = Number.isInteger(expectedCount) && expectedCount >= 0
    ? expectedCount
    : n;

  if (!n) {
    return {
      status: 'RAW_NOT_OBSERVABLE',
      raw: null,
      meanScore: null,
      worstDecileScore: null,
      lowestFileScore: null,
      n,
    };
  }

  const decileSize = Math.max(1, Math.ceil(n * 0.1));
  const meanScore = values.reduce((sum, value) => sum + value, 0) / n;
  const worstDecileScore = (
    values.slice(0, decileSize)
      .reduce((sum, value) => sum + value, 0)
    / decileSize
  );
  const lowestFileScore = values[0];
  const raw = (
    0.5 * meanScore
    + 0.3 * worstDecileScore
    + 0.2 * lowestFileScore
  );

  return {
    status: n === expected
      ? 'COMPLETE_INPUTS'
      : 'PROVISIONAL_INCOMPLETE',
    raw,
    meanScore,
    worstDecileScore,
    lowestFileScore,
    decileSize,
    n,
  };
}
