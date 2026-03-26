import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VISUAL_BASELINES_DIR = path.join(__dirname, 'baselines');
export const VISUAL_ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

export async function captureWorkspaceGolden(page) {
  return page.locator('#workspace').screenshot({ animations: 'disabled' });
}

export async function captureRegionGolden(page, options = {}) {
  const { selector = null, selectors = null, rect = null, padding = 12 } = options;
  let clip = rect;
  if (!clip) {
    const selectorList = selectors || (selector ? [selector] : []);
    assert.ok(selectorList.length > 0, 'captureRegionGolden requires selector(s) or rect');
    clip = await page.evaluate(({ selectorList }) => {
      const nodes = selectorList.map((item) => document.querySelector(item)).filter(Boolean);
      if (!nodes.length) return null;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }
      return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
    }, { selectorList });
  }
  assert.ok(clip, 'captureRegionGolden: missing clip rect');
  const viewport = page.viewportSize();
  const normalized = {
    x: Math.max(0, Math.floor(clip.left - padding)),
    y: Math.max(0, Math.floor(clip.top - padding)),
    width: Math.max(1, Math.ceil(clip.width + padding * 2)),
    height: Math.max(1, Math.ceil(clip.height + padding * 2)),
  };
  normalized.width = Math.min(normalized.width, Math.max(1, viewport.width - normalized.x));
  normalized.height = Math.min(normalized.height, Math.max(1, viewport.height - normalized.y));
  return page.screenshot({ animations: 'disabled', clip: normalized });
}

export async function compareOrUpdateGolden(name, buffer, options = {}) {
  const {
    rmseThreshold = 0.02,
    fuzzPercent = 2,
  } = options;

  await fs.mkdir(VISUAL_BASELINES_DIR, { recursive: true });
  await fs.mkdir(VISUAL_ARTIFACTS_DIR, { recursive: true });

  const baselinePath = path.join(VISUAL_BASELINES_DIR, name);
  const actualPath = path.join(VISUAL_ARTIFACTS_DIR, `${name}.actual.png`);
  const diffPath = path.join(VISUAL_ARTIFACTS_DIR, `${name}.diff.png`);

  const update = process.env.RF_UPDATE_VISUAL_BASELINES === '1';
  if (update) {
    await fs.writeFile(baselinePath, buffer);
    return { updated: true, baselinePath };
  }

  let baseline;
  try {
    baseline = await fs.readFile(baselinePath);
  } catch {
    throw new Error(`missing visual baseline: ${baselinePath}. Re-run with RF_UPDATE_VISUAL_BASELINES=1 to create it.`);
  }

  await fs.writeFile(actualPath, buffer);

  const args = [
    '-metric', 'RMSE',
    '-fuzz', `${fuzzPercent}%`,
    baselinePath,
    actualPath,
    diffPath,
  ];

  let normalized = 0;
  try {
    const { stderr } = await execFileAsync('compare', args);
    normalized = parseRmse(stderr);
  } catch (error) {
    if (error.code !== 1) throw error;
    normalized = parseRmse(error.stderr || '');
  }

  assert.ok(
    normalized <= rmseThreshold,
    `visual diff mismatch ${name}: rmse=${normalized} > ${rmseThreshold} baseline=${baselinePath} actual=${actualPath} diff=${diffPath}`,
  );

  await Promise.all([
    fs.rm(actualPath, { force: true }),
    fs.rm(diffPath, { force: true }),
  ]);

  return { updated: false, baselinePath, actualPath, diffPath, rmse: normalized };
}

function parseRmse(stderr) {
  const match = /\(([\d.]+)\)/.exec(stderr || '');
  if (match) return Number.parseFloat(match[1]);
  const fallback = Number.parseFloat((stderr || '').trim());
  return Number.isFinite(fallback) ? fallback : Number.POSITIVE_INFINITY;
}
