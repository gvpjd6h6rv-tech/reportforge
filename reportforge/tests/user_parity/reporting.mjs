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
