import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const browser = process.env.RF_BROWSER || 'chrome';
const headless = process.env.RF_HEADED === '1' ? false : true;
const viewportWidth = Number(process.env.RF_VIEWPORT_WIDTH || 1650);
const viewportHeight = Number(process.env.RF_VIEWPORT_HEIGHT || 900);


function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p)) || null;
}

const chromeBin =
  process.env.CHROME_BIN ||
  firstExisting([
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/google-chrome',
  ]);

const chromiumBin =
  process.env.CHROMIUM_BIN ||
  firstExisting([
    '/usr/bin/ungoogled-chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]);

const firefoxBin =
  process.env.FIREFOX_BIN ||
  firstExisting([
    '/usr/bin/firefox',
    '/usr/bin/firefox-esr',
  ]);

const launchByBrowser = {
  chrome: chromeBin,
  chromium: chromiumBin,
  firefox: firefoxBin,
};

const executablePath = launchByBrowser[browser];

if (!executablePath) {
  throw new Error(`No encontré navegador real para RF_BROWSER=${browser}`);
}

console.log(`[RF LIVE] browser=${browser} executable=${executablePath} headless=${headless}`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['line']],
  // Fase 15 (EVIDENCE-F14-1): reportforge_server.py is a stdlib
  // http.server.HTTPServer — single-threaded, no ThreadingMixIn. Running
  // these specs in parallel saturates it under concurrent page loads
  // (~160 <script> tags each), causing intermittent timeouts even with
  // real-condition waits (no fixed sleeps left in the specs). Until the
  // dev server itself is made concurrent (out of scope here), this suite
  // is a sequential-only contract.
  workers: 1,
  use: {
    baseURL: process.env.RF_LIVE_URL || 'http://127.0.0.1:5001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless,
    viewport: { width: viewportWidth, height: viewportHeight },
    launchOptions: {
      executablePath,
      headless,
      args: browser === 'chrome' ? [`--window-size=${viewportWidth},${viewportHeight}`] : [],
    },
  },
  projects: [
    {
      name: `${browser}-real`,
      use: {
        ...(browser === 'firefox' ? devices['Desktop Firefox'] : devices['Desktop Chrome']),
        browserName: browser === 'firefox' ? 'firefox' : 'chromium',
        viewport: { width: viewportWidth, height: viewportHeight },
        launchOptions: {
          executablePath,
          headless,
          args: browser === 'chrome' ? [`--window-size=${viewportWidth},${viewportHeight}`] : [],
        },
      },
    },
  ],
});
