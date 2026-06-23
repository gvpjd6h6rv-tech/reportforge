import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
  return 20000 + Math.floor(Math.random() * 40000);
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

export async function waitForRuntimeReady(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => typeof document !== 'undefined' && document.documentElement?.dataset?.rfRuntimeReady === '1',
    null,
    { timeout: timeoutMs },
  );
}

async function startRuntimeServerOnce(port) {
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

// randomPort() draws from a 20000-port range with no memory of recently used
// ports — across a full suite run (hundreds of server starts) the birthday
// paradox makes a same-port collision likely, and the OS may still be in
// TIME_WAIT for a just-stopped server on that exact port. A bind failure
// kills the spawned process immediately, so waitForServer's own retry loop
// can't recover (the process is already gone) — it just times out after a
// full 15s wait. Retrying with a freshly-randomized port is the standard,
// cheap fix for this class of flake.
export async function startRuntimeServer(port = randomPort(), attemptsLeft = 3) {
  try {
    return await startRuntimeServerOnce(port);
  } catch (err) {
    if (attemptsLeft <= 1 || !/Address already in use|did not become ready/.test(err.message)) throw err;
    return startRuntimeServer(randomPort(), attemptsLeft - 1);
  }
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

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForRuntimeReady(page);
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
    headless: process.env.RF_HEADED === '1' ? false : true,
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
        headless: process.env.RF_HEADED === '1' ? false : true,
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
      headless: process.env.RF_HEADED === '1' ? false : true,
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
          headless: process.env.RF_HEADED === '1' ? false : true,
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
  const target = page.locator('#preview-content .pv-el').nth(index);
  const box = await target.boundingBox();
  assert.ok(box, `preview element ${index} missing`);
  await target.click({
    position: {
      x: Math.min(Math.max(8, box.width * 0.25), Math.max(8, box.width - 8)),
      y: Math.max(1, Math.min(box.height * 0.5, box.height - 1)),
    },
  });
  await page.waitForTimeout(120);
}

export async function selectPreviewMulti(page, first = 0, second = 1) {
  const firstTarget = page.locator('#preview-content .pv-el').nth(first);
  const firstBox = await firstTarget.boundingBox();
  assert.ok(firstBox, `preview element ${first} missing`);
  await firstTarget.click({
    position: {
      x: Math.min(Math.max(8, firstBox.width * 0.25), Math.max(8, firstBox.width - 8)),
      y: Math.max(1, Math.min(firstBox.height * 0.5, firstBox.height - 1)),
    },
  });
  await page.waitForTimeout(60);
  const secondTarget = page.locator('#preview-content .pv-el').nth(second);
  const secondBox = await secondTarget.boundingBox();
  assert.ok(secondBox, `preview element ${second} missing`);
  await secondTarget.click({
    modifiers: ['Shift'],
    position: {
      x: Math.min(Math.max(8, secondBox.width * 0.25), Math.max(8, secondBox.width - 8)),
      y: Math.max(1, Math.min(secondBox.height * 0.5, secondBox.height - 1)),
    },
  });
  await page.waitForTimeout(120);
}

export async function getSelectionSnapshot(page) {
  return page.evaluate(() => ({
    selectionLayerSelector: DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer',
    dsSelection: [...DS.selection],
    domSelected: [...document.querySelectorAll('.cr-element.selected')].map(el => el.dataset.id),
    elementCount: document.querySelectorAll('.cr-element:not(.pv-el)').length,
    uniqueElementIds: new Set([...document.querySelectorAll('.cr-element:not(.pv-el)')].map(el => el.dataset.id)).size,
    previewElementCount: document.querySelectorAll('#preview-content .pv-el').length,
    boxCount: (() => {
      const layer = document.querySelector(DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer');
      return layer ? layer.querySelectorAll('.sel-box').length : 0;
    })(),
    handleCount: (() => {
      const layer = document.querySelector(DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer');
      return layer ? layer.querySelectorAll('.sel-handle').length : 0;
    })(),
    selectionGuideCount: (() => {
      const layer = document.querySelector(DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer');
      return layer ? layer.querySelectorAll('.selection-guide').length : 0;
    })(),
    guideLineCount: document.querySelectorAll('#guide-layer .rf-guide-line').length,
  }));
}

export async function getSingleAlignment(page) {
  return page.evaluate(() => {
    const id = [...DS.selection][0];
    const layer = document.querySelector(DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer');
    const box = layer ? layer.querySelector('.sel-box') : null;
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
    const layer = document.querySelector(DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer');
    const box = layer ? layer.querySelector('.sel-box') : null;
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

// Real browser text rendering has inherent sub-pixel anti-aliasing jitter:
// two independent runs of the same test produce byte-identical screenshots
// of each other, yet a screenshot captured via a separate baseline-update
// script run can differ by a few dozen pixels with low channel delta. Exact
// hash equality can't absorb that, so a mismatch falls back to a tolerant
// perceptual diff before failing. Thresholds are calibrated against real,
// confirmed regressions (selection-guide bug, missing-font drift), which
// produced 2-4% of pixels changed with max channel delta 253-255 — both
// far outside this tolerance.
const SNAPSHOT_TOLERANCE = { maxNonzeroRatio: 0.002, maxChannelDiff: 64 };

function perceptualDiff(baselinePath, actualPath) {
  const result = spawnSync('python3', [
    path.join(__dirname, 'compare_png_tolerance.py'),
    baselinePath,
    actualPath,
  ], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.error ? null : parsed;
  } catch (_e) {
    return null;
  }
}

export async function compareSnapshotBuffer(name, buffer) {
  const baselinePath = path.join(BASELINES_DIR, name);
  const actualPath = path.join(ARTIFACTS_DIR, name);
  const baseline = await fs.readFile(baselinePath);
  if (baseline.equals(buffer)) return;

  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  await fs.writeFile(actualPath, buffer);

  const diff = perceptualDiff(baselinePath, actualPath);
  if (diff) {
    const ratio = diff.nonzero / diff.total;
    if (ratio <= SNAPSHOT_TOLERANCE.maxNonzeroRatio && diff.maxDiff <= SNAPSHOT_TOLERANCE.maxChannelDiff) {
      return;
    }
    throw new Error(
      `snapshot mismatch: ${name} expected=${sha256(baseline)} actual=${sha256(buffer)} artifact=${actualPath} ` +
      `diff=${diff.nonzero}/${diff.total} (${(ratio * 100).toFixed(3)}%) maxChannelDiff=${diff.maxDiff}`
    );
  }
  throw new Error(`snapshot mismatch: ${name} expected=${sha256(baseline)} actual=${sha256(buffer)} artifact=${actualPath}`);
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
    boxCount: (() => {
      const layer = document.querySelector(DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer');
      return layer ? layer.querySelectorAll('.sel-box').length : 0;
    })(),
    handleCount: (() => {
      const layer = document.querySelector(DS.previewMode ? '#preview-content .preview-selection-layer' : '#handles-layer');
      return layer ? layer.querySelectorAll('.sel-handle').length : 0;
    })(),
    previewPages: document.querySelectorAll('#preview-content .preview-render-layer .rpt-page, #preview-content .preview-hit-layer .pv-page').length,
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
  await page.waitForFunction(() => document.querySelector('#preview-content .preview-render-layer .rpt-page, #preview-content .preview-hit-layer .pv-page, #preview-content .preview-loading--error'));
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
  await page.evaluate(() => {
    document.querySelectorAll('#preview-content .preview-selection-layer .sel-handle').forEach((handle) => {
      handle.dataset.rfPrevPointerEvents = handle.style.pointerEvents || '';
      handle.style.pointerEvents = 'none';
    });
  });
  await page.mouse.move(box.x + 20, box.y + Math.min(8, box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + 20 + dx, box.y + Math.min(8, box.height / 2) + dy, { steps: 8 });
  await page.mouse.up();
  await page.evaluate(() => {
    document.querySelectorAll('#preview-content .preview-selection-layer .sel-handle').forEach((handle) => {
      handle.style.pointerEvents = handle.dataset.rfPrevPointerEvents || '';
      delete handle.dataset.rfPrevPointerEvents;
    });
  });
  await page.waitForTimeout(180);
}

export async function resizeFromHandle(page, pos, dx, dy) {
  const selector = await page.evaluate((handlePos) => (
    DS.previewMode
      ? `#preview-content .preview-selection-layer .sel-handle[data-pos="${handlePos}"]`
      : `#handles-layer .sel-handle[data-pos="${handlePos}"]`
  ), pos);
  const handle = page.locator(selector);
  const box = await handle.boundingBox();
  assert.ok(box, `handle ${pos} missing`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

export async function reloadRuntime(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForRuntimeReady(page);
  await page.waitForFunction(
    () => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0,
  );
  await page.waitForTimeout(800);
}

export { ROOT, BASELINES_DIR, ARTIFACTS_DIR };
