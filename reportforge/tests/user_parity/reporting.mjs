export function computeEnvironmentCoverageScore(options = {}) {
  const {
    availability = {},
    exercisedBrowsers = [],
    targetBrowsers = ['chromium', 'firefox', 'webkit'],
  } = options;
  const breakdown = {};
  let total = 0;
  let sum = 0;

  for (const browserName of targetBrowsers) {
    const info = availability[browserName] || {};
    const exercised = exercisedBrowsers.includes(browserName);
    let status = 'not exercised';
    let value = 0;
    if (exercised && info.usable) {
      status = 'covered';
      value = 1;
    } else if (info.usable) {
      status = 'partially covered';
      value = 0.55;
    } else if (info.detectedInSystem || info.playwrightManagedUsable === false) {
      status = 'blocked by environment';
      value = 0.25;
    }
    breakdown[browserName] = {
      status,
      exercised,
      launchSource: info.launchSource || null,
      executablePath: info.executablePath || null,
      detectedInSystem: !!info.detectedInSystem,
      playwrightManagedUsable: !!info.playwrightManagedUsable,
      fallbackUsable: !!info.fallbackUsable,
      reason: info.reason || info.playwrightManagedError || info.fallbackError || null,
      score: Math.round(value * 1000) / 10,
    };
    total += 1;
    sum += value;
  }

  const score = total ? Math.round((sum / total) * 1000) / 10 : 0;
  return {
    score,
    status: score >= 95 ? 'PASS' : (score >= 80 ? 'WARNING' : 'FAIL'),
    breakdown,
  };
}

export function combineConfidenceScores(flowScore, environmentScore, options = {}) {
  const { flowWeight = 0.8, environmentWeight = 0.2 } = options;
  const combined = Math.round((flowScore * flowWeight + environmentScore * environmentWeight) * 10) / 10;
  return {
    flowScore,
    environmentScore,
    combinedScore: combined,
    flowWeight,
    environmentWeight,
    status: combined >= 95 ? 'PASS' : (combined >= 80 ? 'WARNING' : 'FAIL'),
  };
}

// ---------------------------------------------------------------------------
// Flow summary formatter — produces one readable diagnostic line per test run
// ---------------------------------------------------------------------------

export function formatFlowSummary(options = {}) {
  const {
    flow,
    browser = null,
    occludedRatio = null,
    minGapPx = null,
    maxOverlapRatio = null,
    jitterScore = null,
    collapseRisk = null,
    labels = [],
    replacesManualCheck = null,
    confidenceScore = null,
  } = options;
  const parts = [`flow=${flow}`];
  if (browser) parts.push(`browser=${browser}`);
  if (occludedRatio !== null) parts.push(`occludedRatio=${Math.round(occludedRatio * 100)}%`);
  if (minGapPx !== null) parts.push(`minGapPx=${minGapPx}`);
  if (maxOverlapRatio !== null) parts.push(`overlapRatio=${maxOverlapRatio}`);
  if (jitterScore !== null) parts.push(`jitter=${jitterScore}`);
  if (collapseRisk) parts.push(`collapse=${collapseRisk}`);
  if (confidenceScore !== null) parts.push(`confidence=${confidenceScore}`);
  if (labels.length) parts.push(`labels=[${labels.join(',')}]`);
  if (replacesManualCheck) parts.push(`replaces="${replacesManualCheck}"`);
  return `PARITY SUMMARY: ${parts.join(' | ')}`;
}

// ---------------------------------------------------------------------------
// Flakiness band: detects variation across repeated runs of the same signal
// ---------------------------------------------------------------------------

export function computeFlakinessBand(measurements = [], options = {}) {
  const { warnThreshold = 0.05 } = options;
  if (measurements.length < 2) {
    return { stable: true, spread: 0, mean: measurements[0] ?? 0, min: measurements[0] ?? 0, max: measurements[0] ?? 0, warnLevel: 'none', values: measurements };
  }
  const min = Math.min(...measurements);
  const max = Math.max(...measurements);
  const spread = max - min;
  const mean = measurements.reduce((s, v) => s + v, 0) / measurements.length;
  const stable = spread <= warnThreshold;
  return {
    stable,
    spread: Math.round(spread * 1000) / 1000,
    mean: Math.round(mean * 1000) / 1000,
    min,
    max,
    warnLevel: stable ? 'none' : (spread > warnThreshold * 3 ? 'high' : 'medium'),
    values: measurements,
  };
}

// ---------------------------------------------------------------------------
// Score quality check: warns when score passes trivially (too many stableSignals)
// ---------------------------------------------------------------------------

export function assessScoreQuality(confidenceResult, options = {}) {
  // A score backed mostly by stableSignal (value=1, no real evidence) is not meaningful.
  // We detect this by counting dimensions at exactly 100 in the breakdown — these are
  // almost always stableSignals since real signals rarely land at a perfect 100.
  //
  // Additionally we distinguish heuristic-basis dims at 100% (always suspicious — these
  // are designed assumptions that never discriminate) from evidence-basis dims at 100%
  // (acceptable — strong real-signal result). If all heuristic dims saturate together
  // with most evidence dims, the score is likely inflated rather than earned.
  const { saturatedWarnRatio = 0.7 } = options;
  if (!confidenceResult?.breakdown) return { quality: 'unknown', warning: null, saturatedRatio: null };
  const dims = Object.values(confidenceResult.breakdown);
  const saturated = dims.filter((d) => d.score >= 99.9).length;
  const total = dims.length;
  const saturatedRatio = total > 0 ? saturated / total : 0;

  // Separate heuristic saturation from evidence saturation
  const heuristicDims = dims.filter((d) => d.basis === 'heuristic');
  const heuristicSaturated = heuristicDims.filter((d) => d.score >= 99.9).length;
  const heuristicSaturatedRatio = heuristicDims.length > 0 ? heuristicSaturated / heuristicDims.length : 0;

  if (saturatedRatio >= saturatedWarnRatio) {
    const heuristicNote = heuristicSaturatedRatio >= 1
      ? `; all ${heuristicDims.length} heuristic dimensions also at 100% — score inflation likely`
      : '';
    return {
      quality: 'warning',
      warning: `${saturated}/${total} dimensions at 100% — score may be inflated by stableSignal usage${heuristicNote}`,
      saturatedRatio: Math.round(saturatedRatio * 100),
      heuristicSaturatedRatio: Math.round(heuristicSaturatedRatio * 100),
    };
  }
  return {
    quality: 'ok',
    warning: null,
    saturatedRatio: Math.round(saturatedRatio * 100),
    heuristicSaturatedRatio: Math.round(heuristicSaturatedRatio * 100),
  };
}

export function buildCoverageMatrix(categoryRuns = {}, availability = {}, targetBrowsers = ['chromium', 'firefox', 'webkit']) {
  const matrix = {};
  for (const [category, exercisedBrowsers] of Object.entries(categoryRuns)) {
    matrix[category] = {};
    for (const browserName of targetBrowsers) {
      const info = availability[browserName] || {};
      if ((exercisedBrowsers || []).includes(browserName) && info.usable) {
        matrix[category][browserName] = 'covered';
      } else if (info.usable) {
        matrix[category][browserName] = 'partially covered';
      } else if (info.detectedInSystem || info.playwrightManagedUsable === false) {
        matrix[category][browserName] = 'blocked by environment';
      } else {
        matrix[category][browserName] = 'not exercised';
      }
    }
  }
  return matrix;
}
