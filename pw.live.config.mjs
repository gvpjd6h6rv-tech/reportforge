import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const baseURL = process.env.RF_LIVE_BASE_URL || 'http://127.0.0.1:5017';
const headless = process.env.RF_LIVE_HEADLESS === '1';
const slowMo = Number(process.env.RF_LIVE_SLOWMO_MS || '350');

function firstExisting(paths) {
  return paths.find((candidate) => candidate && existsSync(candidate));
}

const chromeExecutable =
  process.env.RF_CHROME_EXECUTABLE ||
  firstExisting([
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/google-chrome',
  ]);

const ungoogledExecutable =
  process.env.RF_UNGOOGLED_CHROMIUM_EXECUTABLE ||
  firstExisting([
    '/var/lib/flatpak/exports/bin/io.github.ungoogled_software.ungoogled_chromium',
    `${process.env.HOME || ''}/.local/share/flatpak/exports/bin/io.github.ungoogled_software.ungoogled_chromium`,
    '/var/lib/flatpak/exports/bin/com.github.Eloston.UngledChromium',
    `${process.env.HOME || ''}/.local/share/flatpak/exports/bin/com.github.Eloston.UngoogledChromium`,
    '/usr/bin/ungoogled-chromium',
    '/usr/bin/ungoogled-chromium-browser',
  ]);

if (!chromeExecutable) {
  throw new Error('Google Chrome oficial no encontrado. Define RF_CHROME_EXECUTABLE=/ruta/google-chrome');
}
if (!ungoogledExecutable) {
  throw new Error('Ungoogled Chromium no encontrado. Define RF_UNGOOGLED_CHROMIUM_EXECUTABLE=/ruta/ungoogled');
}

console.log('[RF LIVE] Chrome oficial:', chromeExecutable);
console.log('[RF LIVE] Ungoogled:', ungoogledExecutable);
console.log('[RF LIVE] Chromium standalone: DISABLED / FORBIDDEN');

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL,
    headless,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 980 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chrome-official-real',
      testMatch: /reportforge\/tests\/e2e\/live_smoke_reportforge_real\.spec\.mjs$/,
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        launchOptions: { executablePath: chromeExecutable, slowMo },
      },
    },
    {
      name: 'ungoogled-real',
      testMatch: /reportforge\/tests\/e2e\/live_smoke_reportforge_real\.spec\.mjs$/,
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        launchOptions: { executablePath: ungoogledExecutable, slowMo },
      },
    },
  ],
});
