import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const browser = process.env.RF_BROWSER || 'chrome';
const headless = process.env.RF_HEADED === '1' ? false : true;

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
  use: {
    baseURL: process.env.RF_LIVE_URL || 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless,
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      executablePath,
      headless,
      args: browser === 'chrome' ? ['--start-maximized'] : [],
    },
  },
  projects: [
    {
      name: `${browser}-real`,
      use: {
        ...(browser === 'firefox' ? devices['Desktop Firefox'] : devices['Desktop Chrome']),
        browserName: browser === 'firefox' ? 'firefox' : 'chromium',
      },
    },
  ],
});
