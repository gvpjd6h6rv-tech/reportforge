import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const BASELINES_DIR = path.join(__dirname, 'baselines');
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');
const DEFAULT_PORT = 19991;
const BROWSER_TYPES = { chromium, firefox, webkit };
let browserAvailabilityCache = null;
const COMMON_BROWSER_ARGS = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
const BROWSER_EXECUTABLE_CANDIDATES = {
  chromium: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
  firefox: ['/usr/bin/firefox', '/usr/bin/firefox-esr'],
  webkit: [],
};

function randomPort() {
  return 20000 + Math.floor(Math.random() * 20000);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready: ${url}`);
}

export async function startRuntimeServer(port = randomPort()) {
  const proc = spawn('python3', ['reportforge_server.py', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
  proc.stdout.on('data', () => {});

  try {
    await waitForServer(`http://127.0.0.1:${port}/health`);
  } catch (err) {
    proc.kill('SIGINT');
    throw new Error(`failed to start runtime server: ${err.message}\n${stderr}`);
  }

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}/`,
    proc,
    async stop() {
      if (proc.killed || proc.exitCode !== null) return;
      proc.kill('SIGINT');
      await new Promise(resolve => proc.once('exit', resolve));
    },
  };
}

export async function launchRuntimePage(baseUrl, options = {}) {
  const { browserName = 'chromium' } = options;
  const browserType = BROWSER_TYPES[browserName];
  assert.ok(browserType, `unsupported browser: ${browserName}`);
  const resolution = await resolveBrowserLaunch(browserName);
  assert.ok(resolution.usable, `browser ${browserName} is not usable: ${JSON.stringify(resolution)}`);
  const browser = await browserType.launch(resolution.launchOptions);
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    consoleErrors.push(`PAGEERROR: ${err.message}`);
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
  await page.waitForTimeout(800);

  return { browser, page, consoleErrors, launchInfo: resolution };
}

export async function getBrowserAvailability(browserNames = ['chromium', 'firefox', 'webkit']) {
  const report = {};
  for (const browserName of browserNames) {
    report[browserName] = await resolveBrowserLaunch(browserName);
  }
  return report;
}

async function resolveBrowserLaunch(browserName) {
  if (!browserAvailabilityCache) browserAvailabilityCache = {};
  if (browserAvailabilityCache[browserName]) return browserAvailabilityCache[browserName];
  const browserType = BROWSER_TYPES[browserName];
  if (!browserType) {
    const unsupported = {
      browserName,
      detectedInSystem: false,
      systemCandidates: [],
      playwrightManagedUsable: false,
      playwrightManagedError: 'unsupported browser type',
      fallbackUsable: false,
      fallbackError: null,
      usable: false,
      launchSource: null,
      launchOptions: null,
      executablePath: null,
      available: false,
      reason: 'unsupported browser type',
    };
    browserAvailabilityCache[browserName] = unsupported;
    return unsupported;
  }

  const systemCandidates = await detectSystemCandidates(browserName);
  const managedProbe = await probeBrowserLaunch(browserType, {
    headless: true,
    args: browserLaunchArgs(browserName),
  });
  if (managedProbe.ok) {
    const result = {
      browserName,
      detectedInSystem: systemCandidates.some((candidate) => candidate.exists),
      systemCandidates,
      playwrightManagedUsable: true,
      playwrightManagedError: null,
      fallbackUsable: false,
      fallbackError: null,
      usable: true,
      launchSource: 'playwright-managed',
      launchOptions: {
        headless: true,
        args: browserLaunchArgs(browserName),
      },
      executablePath: null,
      available: true,
      reason: null,
    };
    browserAvailabilityCache[browserName] = result;
    return result;
  }

  let fallbackResult = null;
  for (const candidate of systemCandidates.filter((item) => item.exists)) {
    const probe = await probeBrowserLaunch(browserType, {
      headless: true,
      executablePath: candidate.path,
      args: browserLaunchArgs(browserName),
    });
    if (probe.ok) {
      fallbackResult = {
        browserName,
        detectedInSystem: true,
        systemCandidates,
        playwrightManagedUsable: false,
        playwrightManagedError: managedProbe.error,
        fallbackUsable: true,
        fallbackError: null,
        usable: true,
        launchSource: 'system-fallback',
        launchOptions: {
          headless: true,
          executablePath: candidate.path,
          args: browserLaunchArgs(browserName),
        },
        executablePath: candidate.path,
        available: true,
        reason: null,
      };
      break;
    }
    fallbackResult = {
      browserName,
      detectedInSystem: true,
      systemCandidates,
      playwrightManagedUsable: false,
      playwrightManagedError: managedProbe.error,
      fallbackUsable: false,
      fallbackError: probe.error,
      usable: false,
      launchSource: null,
      launchOptions: null,
      executablePath: candidate.path,
      available: false,
      reason: probe.error,
    };
  }

  const result = fallbackResult || {
    browserName,
    detectedInSystem: systemCandidates.some((candidate) => candidate.exists),
    systemCandidates,
    playwrightManagedUsable: false,
    playwrightManagedError: managedProbe.error,
    fallbackUsable: false,
    fallbackError: systemCandidates.some((candidate) => candidate.exists) ? 'no usable system fallback' : 'no system browser detected',
    usable: false,
    launchSource: null,
    launchOptions: null,
    executablePath: null,
    available: false,
    reason: systemCandidates.some((candidate) => candidate.exists) ? managedProbe.error : 'no system browser detected',
  };
  browserAvailabilityCache[browserName] = result;
  return result;
}

async function detectSystemCandidates(browserName) {
  const candidates = BROWSER_EXECUTABLE_CANDIDATES[browserName] || [];
  const results = [];
  for (const candidate of candidates) {
    results.push({
      path: candidate,
      exists: await pathExists(candidate),
    });
  }
  return results;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function probeBrowserLaunch(browserType, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const browser = await browserType.launch(options);
      await browser.close();
      return { ok: true, error: null };
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, error: lastError ? lastError.message : 'unknown launch failure' };
}

function browserLaunchArgs(browserName) {
  if (browserName === 'webkit') return [];
  return [...COMMON_BROWSER_ARGS];
}

export async function clearSelectionByCanvasClick(page) {
  const canvas = await page.locator('#canvas-layer').boundingBox();
  assert.ok(canvas, 'canvas-layer missing');
  await page.mouse.click(canvas.x + canvas.width - 40, canvas.y + canvas.height - 40);
  await page.waitForTimeout(80);
}

export async function selectSingle(page, index = 0) {
  await clearSelectionByCanvasClick(page);
  await page.locator('.cr-element').nth(index).click();
  await page.waitForTimeout(120);
}

export async function selectMulti(page, first = 0, second = 1) {
  await clearSelectionByCanvasClick(page);
  await page.locator('.cr-element').nth(first).click();
  await page.waitForTimeout(60);
  await page.locator('.cr-element').nth(second).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(120);
}

export async function selectPreviewSingle(page, index = 0) {
  await page.locator('#preview-content .pv-el').nth(index).click();
  await page.waitForTimeout(120);
}

export async function selectPreviewMulti(page, first = 0, second = 1) {
  await page.locator('#preview-content .pv-el').nth(first).click();
  await page.waitForTimeout(60);
  await page.locator('#preview-content .pv-el').nth(second).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(120);
}

export async function getSelectionSnapshot(page) {
  return page.evaluate(() => ({
    dsSelection: [...DS.selection],
    domSelected: [...document.querySelectorAll('.cr-element.selected')].map(el => el.dataset.id),
    elementCount: document.querySelectorAll('.cr-element:not(.pv-el)').length,
    uniqueElementIds: new Set([...document.querySelectorAll('.cr-element:not(.pv-el)')].map(el => el.dataset.id)).size,
    previewElementCount: document.querySelectorAll('#preview-content .pv-el').length,
    boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
    handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
  }));
}

export async function getSingleAlignment(page) {
  return page.evaluate(() => {
    const id = [...DS.selection][0];
    const box = document.querySelector('#handles-layer .sel-box');
    let el = null;
    if (id) {
      el = DS.previewMode
        ? document.querySelector('#preview-content .pv-el.selected')
        : document.querySelector(`.cr-element[data-id="${id}"]`);
    }
    if (!id || !box || !el) return null;
    const br = box.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return {
      box: { left: br.left, top: br.top, width: br.width, height: br.height },
      element: { left: er.left, top: er.top, width: er.width, height: er.height },
    };
  });
}

export async function getMultiBBox(page) {
  return page.evaluate(() => {
    const box = document.querySelector('#handles-layer .sel-box');
    const selected = DS.previewMode
      ? [...DS.selection].flatMap(id => [...document.querySelectorAll(`.pv-el[data-origin-id="${id}"]`)])
      : [...document.querySelectorAll('.cr-element.selected')];
    if (!box || selected.length < 2) return null;
    const br = box.getBoundingClientRect();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const el of selected) {
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return {
      box: { left: br.left, top: br.top, width: br.width, height: br.height },
      expected: { left, top, width: right - left, height: bottom - top },
    };
  });
}

export function assertRectClose(actual, expected, tolerance = 0.5, label = 'rect') {
  assert.ok(actual && expected, `${label}: missing rect`);
  for (const key of ['left', 'top', 'width', 'height']) {
    const delta = Math.abs(actual[key] - expected[key]);
    assert.ok(delta <= tolerance, `${label}.${key} drift ${delta} > ${tolerance} (actual=${actual[key]}, expected=${expected[key]})`);
  }
}

export async function takeWorkspaceScreenshot(page) {
  const locator = page.locator('#workspace');
  return locator.screenshot({ animations: 'disabled' });
}

export async function compareSnapshotBuffer(name, buffer) {
  const baselinePath = path.join(BASELINES_DIR, name);
  const actualPath = path.join(ARTIFACTS_DIR, name);
  const baseline = await fs.readFile(baselinePath);
  if (!baseline.equals(buffer)) {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    await fs.writeFile(actualPath, buffer);
    throw new Error(`snapshot mismatch: ${name} expected=${sha256(baseline)} actual=${sha256(buffer)} artifact=${actualPath}`);
  }
}

export async function writeBaseline(name, buffer) {
  await fs.mkdir(BASELINES_DIR, { recursive: true });
  await fs.writeFile(path.join(BASELINES_DIR, name), buffer);
}

export async function runtimeState(page) {
  return page.evaluate(() => ({
    zoom: DS.zoom,
    previewMode: DS.previewMode,
    selection: [...DS.selection],
    boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
    handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
    previewPages: document.querySelectorAll('#preview-content .pv-page').length,
    previewClass: document.getElementById('canvas-layer')?.classList.contains('preview-mode') || false,
  }));
}

export async function assertNoConsoleErrors(consoleErrors, context = 'runtime') {
  assert.deepEqual(consoleErrors, [], `${context}: unexpected browser errors:\n${consoleErrors.join('\n')}`);
}

export async function setZoom(page, zoom) {
  await page.evaluate(value => {
    if (DS.previewMode) PreviewZoomEngine.set(value);
    else DesignZoomEngine.set(value);
  }, zoom);
  await page.waitForTimeout(180);
}

export async function enterPreview(page) {
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(350);
}

export async function exitPreview(page) {
  await page.locator('#tab-design').click();
  await page.waitForTimeout(350);
}

export async function dragSelectedElement(page, dx, dy) {
  const target = page.locator('.cr-element.selected').first();
  const box = await target.boundingBox();
  assert.ok(box, 'selected element bounding box missing');
  await page.mouse.move(box.x + 20, box.y + Math.min(8, box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + 20 + dx, box.y + Math.min(8, box.height / 2) + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

export async function dragPreviewSelected(page, dx, dy) {
  const target = page.locator('#preview-content .pv-el.selected').first();
  const box = await target.boundingBox();
  assert.ok(box, 'selected preview element bounding box missing');
  await page.mouse.move(box.x + 20, box.y + Math.min(8, box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + 20 + dx, box.y + Math.min(8, box.height / 2) + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(180);
}

export async function resizeFromHandle(page, pos, dx, dy) {
  const handle = page.locator(`#handles-layer .sel-handle[data-pos="${pos}"]`);
  const box = await handle.boundingBox();
  assert.ok(box, `handle ${pos} missing`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

export async function reloadRuntime(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0,
  );
  await page.waitForTimeout(800);
}

export { ROOT, BASELINES_DIR, ARTIFACTS_DIR };
