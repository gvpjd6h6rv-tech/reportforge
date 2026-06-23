'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'compare_png_tolerance.py');

function makeFixturePng(outPath, { width = 20, height = 20, noisyPixels = 0, fill = [255, 255, 255] } = {}) {
  const code = `
import sys
from PIL import Image
import random
random.seed(42)
img = Image.new("RGB", (${width}, ${height}), tuple(${JSON.stringify(fill)}))
for _ in range(${noisyPixels}):
    x = random.randrange(${width})
    y = random.randrange(${height})
    img.putpixel((x, y), (0, 0, 0))
img.save(sys.argv[1])
`;
  const result = spawnSync('python3', ['-c', code, outPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('compare_png_tolerance — identical images report zero diff', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'png-tol-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  makeFixturePng(a, { noisyPixels: 0 });
  makeFixturePng(b, { noisyPixels: 0 });
  const result = spawnSync('python3', [SCRIPT, a, b], { encoding: 'utf8' });
  const diff = JSON.parse(result.stdout);
  assert.equal(diff.nonzero, 0);
  assert.equal(diff.maxDiff, 0);
});

test('compare_png_tolerance — a handful of noisy pixels reports a small nonzero count, not zero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'png-tol-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  makeFixturePng(a, { width: 50, height: 50, noisyPixels: 0 });
  makeFixturePng(b, { width: 50, height: 50, noisyPixels: 5 });
  const result = spawnSync('python3', [SCRIPT, a, b], { encoding: 'utf8' });
  const diff = JSON.parse(result.stdout);
  assert.ok(diff.nonzero > 0 && diff.nonzero <= 5, `expected <=5 nonzero pixels, got ${diff.nonzero}`);
  assert.equal(diff.total, 2500);
  assert.ok(diff.maxDiff > 0);
});

test('compare_png_tolerance — mismatched sizes report an error, not a crash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'png-tol-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  makeFixturePng(a, { width: 20, height: 20 });
  makeFixturePng(b, { width: 30, height: 30 });
  const result = spawnSync('python3', [SCRIPT, a, b], { encoding: 'utf8' });
  const diff = JSON.parse(result.stdout);
  assert.match(diff.error, /size mismatch/);
});
