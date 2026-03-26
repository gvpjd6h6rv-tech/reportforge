import { startRuntimeServer, launchRuntimePage, getBrowserAvailability } from '../runtime_harness.mjs';
import { buildCoverageMatrix, computeEnvironmentCoverageScore } from './reporting.mjs';

const CATEGORY_RUNS = {
  clipboard: ['chromium'],
  multiselect_drag: ['chromium'],
  undo_redo_visible: ['chromium'],
  fine_composition: ['chromium'],
};

const browserNames = ['chromium', 'firefox', 'webkit'];
const probed = await getBrowserAvailability(browserNames);
const exercised = {};
const server = await startRuntimeServer();

try {
  for (const browserName of browserNames) {
    try {
      const { browser, launchInfo } = await launchRuntimePage(server.baseUrl, { browserName });
      exercised[browserName] = {
        exercised: true,
        succeeded: true,
        launchInfo,
      };
      await browser.close();
    } catch (error) {
      exercised[browserName] = {
        exercised: false,
        succeeded: false,
        reason: error.message,
      };
    }
  }
} finally {
  await server.stop();
}

const availability = Object.fromEntries(browserNames.map((browserName) => {
  if (exercised[browserName]?.succeeded) return [browserName, exercised[browserName].launchInfo];
  return [browserName, probed[browserName]];
}));

const exercisedBrowsers = Object.entries(exercised).filter(([, info]) => info.succeeded).map(([browserName]) => browserName);
const matrix = buildCoverageMatrix(CATEGORY_RUNS, availability);
const environment = computeEnvironmentCoverageScore({
  availability,
  exercisedBrowsers,
});

console.log(JSON.stringify({ availability, exercised, matrix, environment }, null, 2));
