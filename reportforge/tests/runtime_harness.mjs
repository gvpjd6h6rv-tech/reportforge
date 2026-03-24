import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const BASELINES_DIR = path.join(__dirname, 'baselines');
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');
const DEFAULT_PORT = 19991;

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

export async function launchRuntimePage(baseUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
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

  return { browser, page, consoleErrors };
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

export { ROOT, BASELINES_DIR, ARTIFACTS_DIR };
