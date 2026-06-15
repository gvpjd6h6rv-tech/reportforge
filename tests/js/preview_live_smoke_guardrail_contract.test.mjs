import assert from 'node:assert/strict';
import fs from 'node:fs';

const smokePath = 'tests/e2e/live_smoke_preview_cr_parity.spec.js';
const configPath = 'pw.rf-live.config.mjs';

const smoke = fs.readFileSync(smokePath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');

function mustInclude(source, needle, message) {
  assert.ok(
    source.includes(needle),
    `${message}\nMissing required source fragment:\n${needle}`
  );
}

function mustMatch(source, regex, message) {
  assert.ok(
    regex.test(source),
    `${message}\nMissing required pattern:\n${regex}`
  );
}

mustInclude(
  config,
  "const viewportWidth = Number(process.env.RF_VIEWPORT_WIDTH || 1650);",
  'Live smoke config must default to a wide CR-like viewport.'
);

mustInclude(
  config,
  "const viewportHeight = Number(process.env.RF_VIEWPORT_HEIGHT || 900);",
  'Live smoke config must default to a tall enough viewport.'
);

mustInclude(
  config,
  "viewport: { width: viewportWidth, height: viewportHeight }",
  'Project-level device settings must not override the env-controlled viewport.'
);

mustInclude(
  config,
  "`--window-size=${viewportWidth},${viewportHeight}`",
  'Chrome real launch must request the same wide window size as the viewport.'
);

mustInclude(
  config,
  "executablePath",
  'Live smoke must use a real browser executable path, not Playwright bundled browsers.'
);

mustInclude(
  smoke,
  "const A4_RATIO = Math.SQRT2;",
  'Live smoke must enforce A4 physical ratio.'
);

mustInclude(
  smoke,
  "const MIN_WORKSPACE_WIDTH = Number(process.env.RF_PREVIEW_MIN_WORKSPACE_WIDTH || 1100);",
  'Live smoke must fail if it is not running in a wide CR-like workspace.'
);

mustInclude(
  smoke,
  "live smoke must run with a wide CR-like workspace",
  'Live smoke must prove the viewport is wide enough before accepting centered geometry.'
);

mustInclude(
  smoke,
  "A4 page must be horizontally centered in workspace",
  'Live smoke must enforce horizontal centering.'
);

mustInclude(
  smoke,
  "preview stage must be at least as tall as the A4 page",
  'Live smoke must enforce preview stage vertical coverage.'
);

mustInclude(
  smoke,
  "canvas stage must be at least as tall as the A4 page",
  'Live smoke must enforce canvas stage vertical coverage.'
);

mustInclude(
  smoke,
  "workspace.scrollTop = Math.min(420, maxScrollTop);",
  'Live smoke must reproduce manual vertical scrolling.'
);

mustInclude(
  smoke,
  "preview-100-after-manual-scroll-y",
  'Live smoke must collect a second geometry snapshot after manual scroll.'
);

mustInclude(
  smoke,
  "manual scroll smoke must actually move workspace.scrollTop",
  'Live smoke must fail if manual scroll did not actually happen.'
);

mustInclude(
  smoke,
  "A4 page must remain horizontally centered after manual vertical scroll",
  'Live smoke must enforce centering after manual scroll.'
);

mustInclude(
  smoke,
  "A4 ratio must survive manual vertical scroll",
  'Live smoke must enforce A4 ratio after manual scroll.'
);

mustInclude(
  smoke,
  "preview stage must still cover A4 after manual scroll",
  'Live smoke must enforce preview stage height after manual scroll.'
);

mustInclude(
  smoke,
  "canvas stage must still cover A4 after manual scroll",
  'Live smoke must enforce canvas stage height after manual scroll.'
);

mustInclude(
  smoke,
  "RF-PREVIEW-BROWSER-ERRORS",
  'Live smoke must print browser errors explicitly.'
);

mustInclude(
  smoke,
  "RF-PREVIEW-HTTP-ERRORS",
  'Live smoke must print HTTP errors explicitly.'
);

mustInclude(
  smoke,
  "expect.soft(browserErrors",
  'Live smoke must fail on browser errors.'
);

mustInclude(
  smoke,
  "expect.soft(httpErrors",
  'Live smoke must fail on HTTP errors.'
);

mustMatch(
  smoke,
  /page\.on\('response'[\s\S]+status < 400[\s\S]+httpErrors\.push/,
  'Live smoke must collect HTTP 4xx/5xx responses with URL evidence.'
);

mustMatch(
  smoke,
  /collectPreviewGeometry\(page,\s*'preview-100'\)/,
  'Live smoke must collect initial preview geometry.'
);

mustMatch(
  smoke,
  /collectPreviewGeometry\(page,\s*'preview-100-after-manual-scroll-y'\)/,
  'Live smoke must collect post-scroll preview geometry.'
);

console.log('preview live smoke guardrail contract: PASS');
