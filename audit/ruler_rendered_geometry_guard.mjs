#!/usr/bin/env node
/**
 * audit/ruler_rendered_geometry_guard.mjs
 *
 * Measures REAL rendered geometry of ruler elements in Chromium AND Firefox.
 * Three layers of verification — text/grep guards cannot catch layout bugs.
 *
 *   Layer 1 – BCR geometry (getBoundingClientRect, per browser)
 *     INV-1   topRuler.h ≈ sideRuler.w                          (±1.5px)
 *     INV-2   corner.w   = sideRuler.w                          (±1.5px)
 *     INV-3   corner.h   = topRuler.h                           (±1.5px)
 *     INV-4   hCanvas CSS h fills container                     (±1.5px)
 *     INV-5   vCanvas CSS w fills container                     (±1.5px)
 *     INV-6   hCanvas bitmap h = CSS h × DPR                   (±1px)
 *     INV-7   vCanvas bitmap w = CSS w × DPR                   (±1px)
 *     INV-8   no overflow:hidden clips hCanvas
 *     INV-8b  no overflow:hidden clips vCanvas
 *     INV-9   no distorting CSS transform on #ruler-h-row
 *     INV-9b  no distorting CSS transform on #ruler-v
 *     INV-10  RuntimeConfig.ruler.topPx  = rendered topRuler.h (±1.5px)
 *     INV-11  RuntimeConfig.ruler.sidePx = rendered sideRuler.w(±1.5px)
 *
 *   Layer 2 – Canvas draw audit (bitmap pixel scan, inside browser context)
 *     Reports: ctx.getTransform() matrix, painted content span per axis
 *     (informational — surfaces ctx scale bugs and under-draw in bitmap space)
 *
 *   Layer 3 – Screenshot pixel painting analysis (Python PIL)
 *     INV-12  |paintedTopThickness − paintedSideThickness| ≤ 1 (visual symmetry)
 *     INV-13  paintedSideThickness ≥ 20   (vertical ruler not underpainted)
 *     → Saves annotated debug PNG: /tmp/rf_ruler_debug_<browser>.png
 *
 * Prints SHA-256 (first 16 hex chars) of key SSOT files on every run.
 *
 * Exit:   0 = ALL browsers PASS
 *         1 = geometry violation(s) in ≥1 browser
 *         2 = infrastructure / launch error
 *
 * Usage:  node audit/ruler_rendered_geometry_guard.mjs
 */

import { spawn, execFileSync }                    from 'node:child_process';
import { fileURLToPath }                           from 'node:url';
import path                                        from 'node:path';
import { createHash }                              from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir }                                  from 'node:os';
import { chromium, firefox }                       from 'playwright';

const ROOT    = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT    = 29873;
const BASE    = `http://127.0.0.1:${PORT}/`;
const TIMEOUT = 40_000;
const TOL     = 1.5;   // px tolerance for subpixel layout rounding

// ── File hashing ─────────────────────────────────────────────────────────────
function sha256short(relPath) {
  try {
    const buf = readFileSync(path.join(ROOT, relPath));
    return createHash('sha256').update(buf).digest('hex').slice(0, 16);
  } catch { return '(unreadable)'; }
}

// ── Layer 1: BCR measurement script ──────────────────────────────────────────
const MEASURE_SCRIPT = `(() => {
  const q   = id => document.getElementById(id);
  const bcr = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const cs  = el => window.getComputedStyle(el);

  const parseTransform = el => {
    const t = cs(el).transform;
    if (!t || t === 'none') return { scaleX: 1, scaleY: 1, raw: 'none' };
    const m = t.match(/matrix\\(([^)]+)\\)/);
    if (!m) return { scaleX: 1, scaleY: 1, raw: t };
    const parts = m[1].split(',').map(Number);
    return { scaleX: parts[0], scaleY: parts[3], raw: t };
  };

  const clippingAncestor = el => {
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const s = cs(cur);
      if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') {
        const cr = cur.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        if (cr.height < er.height - 2 || cr.width < er.width - 2)
          return { clipped: true, by: cur.id || cur.className || cur.tagName,
                   parentRect: { w: cr.width, h: cr.height }, elRect: { w: er.width, h: er.height } };
      }
      cur = cur.parentElement;
    }
    return { clipped: false };
  };

  const hRow   = q('ruler-h-row');
  const hInner = q('ruler-h-inner');
  const vCol   = q('ruler-v');
  const vInner = q('ruler-v-inner');
  const corner = q('ruler-corner');

  const missing = [
    !hRow   && 'ruler-h-row',
    !hInner && 'ruler-h-inner',
    !vCol   && 'ruler-v',
    !vInner && 'ruler-v-inner',
    !corner && 'ruler-corner',
  ].filter(Boolean);

  if (missing.length) return { error: 'missing DOM elements: ' + missing.join(', ') };

  return {
    dpr:           window.devicePixelRatio,
    runtimeConfig: window.RF?.RuntimeConfig?.ruler ?? null,
    topRuler: {
      containerRect:   bcr(hRow),
      canvasRect:      bcr(hInner),
      canvasBitmap:    { w: hInner.width, h: hInner.height },
      canvasStyleSize: { w: hInner.style.width, h: hInner.style.height },
      transform:       parseTransform(hRow),
      canvasTransform: parseTransform(hInner),
      clip:            clippingAncestor(hInner),
    },
    sideRuler: {
      containerRect:   bcr(vCol),
      canvasRect:      bcr(vInner),
      canvasBitmap:    { w: vInner.width, h: vInner.height },
      canvasStyleSize: { w: vInner.style.width, h: vInner.style.height },
      transform:       parseTransform(vCol),
      canvasTransform: parseTransform(vInner),
      clip:            clippingAncestor(vInner),
    },
    corner: { rect: bcr(corner) },
  };
})()`;

// ── Layer 2: Canvas draw audit script ────────────────────────────────────────
// Reads bitmap pixels INSIDE the browser to find painted content extent per axis,
// plus the current canvas 2D transform (post-draw state).
const CANVAS_AUDIT_SCRIPT = `(() => {
  const auditCanvas = (id, direction) => {
    const canvas = document.getElementById(id);
    if (!canvas) return { error: 'missing' };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'no 2d context' };

    const tm = (typeof ctx.getTransform === 'function') ? ctx.getTransform() : null;
    const transform = tm
      ? { a: +tm.a.toFixed(4), b: +tm.b.toFixed(4),
          c: +tm.c.toFixed(4), d: +tm.d.toFixed(4),
          e: +tm.e.toFixed(2), f: +tm.f.toFixed(2) }
      : null;

    const W = canvas.width, H = canvas.height;
    let paintedMin = null, paintedMax = null;

    if (direction === 'h') {
      // Scan middle bitmap column for non-trivially-white rows
      const midX = Math.floor(W / 2);
      let imgData;
      try { imgData = ctx.getImageData(midX, 0, 1, H).data; } catch { return { error: 'getImageData failed', transform }; }
      for (let y = 0; y < H; y++) {
        const r = imgData[y*4], g = imgData[y*4+1], b = imgData[y*4+2], a = imgData[y*4+3];
        // "significant" = opaque AND not near-white (r/g/b > 245 is treated as blank)
        if (a > 10 && !(r > 245 && g > 245 && b > 245)) {
          if (paintedMin === null) paintedMin = y;
          paintedMax = y;
        }
      }
    } else {
      // Scan middle bitmap row for non-trivially-white cols
      const midY = Math.floor(H / 2);
      let imgData;
      try { imgData = ctx.getImageData(0, midY, W, 1).data; } catch { return { error: 'getImageData failed', transform }; }
      for (let x = 0; x < W; x++) {
        const r = imgData[x*4], g = imgData[x*4+1], b = imgData[x*4+2], a = imgData[x*4+3];
        if (a > 10 && !(r > 245 && g > 245 && b > 245)) {
          if (paintedMin === null) paintedMin = x;
          paintedMax = x;
        }
      }
    }

    return {
      bitmapW: W, bitmapH: H,
      styleW: canvas.style.width || '(unset)', styleH: canvas.style.height || '(unset)',
      transform,
      paintedMin, paintedMax,
      paintedSpan: (paintedMin !== null && paintedMax !== null)
        ? paintedMax - paintedMin + 1 : 0,
    };
  };

  return {
    hCanvas: auditCanvas('ruler-h-inner', 'h'),
    vCanvas: auditCanvas('ruler-v-inner', 'v'),
  };
})()`;

// ── Layer 3: Python PIL pixel analyzer (embedded as string) ──────────────────
// Runs as a subprocess; receives JSON args via sys.argv[1]; prints JSON result.
const PYTHON_PIXEL_ANALYZER = `
import sys, json
from PIL import Image, ImageDraw

args   = json.loads(sys.argv[1])
img    = Image.open(args['imgPath']).convert('RGB')
px     = img.load()
W, H   = img.size
dpr    = float(args.get('dpr', 1))
hRow   = args['hRow']
vCol   = args['vCol']
hInner = args['hInner']
vInner = args['vInner']
out    = args['outPath']

# ── Workspace canvas background colour: #808080 (128,128,128)
# Confirmed from screenshot analysis — workspace fills with this grey.
BG_R, BG_G, BG_B, BG_TOL = 128, 128, 128, 15

def is_workspace_bg(r, g, b):
    return (abs(r - BG_R) <= BG_TOL and
            abs(g - BG_G) <= BG_TOL and
            abs(b - BG_B) <= BG_TOL)

def css2ss(v):
    """CSS px → screenshot px (DPR-aware)."""
    return int(round(float(v) * dpr))

# ── paintedTopThickness ───────────────────────────────────────────────────────
# At x = horizontal-centre of #ruler-h-row, scan rows from hRow.y downward.
# Count consecutive non-workspace rows (= the painted ruler content height).
hCX = css2ss(hRow['x'] + hRow['w'] / 2)
hY0 = css2ss(hRow['y'])
hY1 = css2ss(hRow['y'] + hRow['h'])
hCX = max(0, min(hCX, W - 1))

paintedTopThickness = 0
paintedTopY0 = paintedTopY1 = None
for y in range(hY0, min(hY1, H)):
    r, g, b = px[hCX, y]
    if not is_workspace_bg(r, g, b):
        if paintedTopY0 is None:
            paintedTopY0 = y
        paintedTopY1 = y
        paintedTopThickness += 1

# ── paintedSideThickness ──────────────────────────────────────────────────────
# At y = 1/4 down #ruler-v-inner, scan columns from vCol.x rightward.
# Count consecutive non-workspace cols (= the painted ruler content width).
vCY = css2ss(vInner['y'] + vInner['h'] / 4)
vX0 = css2ss(vCol['x'])
vX1 = css2ss(vCol['x'] + vCol['w'])
vCY = max(0, min(vCY, H - 1))

paintedSideThickness = 0
paintedSideX0 = paintedSideX1 = None
for x in range(vX0, min(vX1, W)):
    r, g, b = px[x, vCY]
    if not is_workspace_bg(r, g, b):
        if paintedSideX0 is None:
            paintedSideX0 = x
        paintedSideX1 = x
        paintedSideThickness += 1

# ── Annotated debug PNG ───────────────────────────────────────────────────────
draw = ImageDraw.Draw(img)

def ss_rect(cx, cy, cw, ch, color, lw=2):
    x0, y0 = css2ss(cx), css2ss(cy)
    x1, y1 = css2ss(cx + cw), css2ss(cy + ch)
    draw.rectangle([x0, y0, x1, y1], outline=color, width=lw)

# BCR container boxes
ss_rect(hRow['x'],   hRow['y'],   hRow['w'],   hRow['h'],   (0, 80, 255), 2)   # blue  = #ruler-h-row
ss_rect(vCol['x'],   vCol['y'],   vCol['w'],   vCol['h'],   (0, 200, 80), 2)   # green = #ruler-v
ss_rect(hInner['x'], hInner['y'], hInner['w'], hInner['h'], (140, 140, 255), 1) # pale blue = hInner
ss_rect(vInner['x'], vInner['y'], vInner['w'], vInner['h'], (140, 255, 140), 1) # pale green = vInner

# Scan lines
draw.line([hCX, hY0, hCX, min(hY1, H-1)],  fill=(255, 140,   0), width=1)  # orange = h scan column
draw.line([vX0, vCY, min(vX1, W-1), vCY],   fill=(  0, 200, 255), width=1)  # cyan   = v scan row

# Painted extent overlays
if paintedTopY0 is not None:
    draw.rectangle([hCX - 50, paintedTopY0, hCX + 50, paintedTopY1],
                   outline=(255, 255, 0), width=2)   # yellow = painted top extent
if paintedSideX0 is not None:
    draw.rectangle([paintedSideX0, vCY - 50, paintedSideX1, vCY + 50],
                   outline=(255, 0, 220), width=2)   # magenta = painted side extent

img.save(out)

print(json.dumps({
    'paintedTopThickness':  paintedTopThickness,
    'paintedSideThickness': paintedSideThickness,
    'paintedTopY0':  paintedTopY0,  'paintedTopY1':  paintedTopY1,
    'paintedSideX0': paintedSideX0, 'paintedSideX1': paintedSideX1,
    'hCenterX': hCX, 'vCenterY': vCY,
    'imgSize':  [W, H],
}))
`;

// ── Run Python pixel analyzer ────────────────────────────────────────────────
function analyzePixels(screenshotPath, bcrPayload, debugPngPath) {
  const tmpScript = path.join(tmpdir(), `rf_px_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  writeFileSync(tmpScript, PYTHON_PIXEL_ANALYZER, 'utf8');
  try {
    const payload = JSON.stringify({ ...bcrPayload, imgPath: screenshotPath, outPath: debugPngPath });
    const out = execFileSync('python3', [tmpScript, payload], {
      encoding: 'utf8',
      timeout: 20_000,
    });
    return { ok: true, ...JSON.parse(out.trim()) };
  } catch (err) {
    return { ok: false, error: err.message, stderr: (err.stderr ?? '').slice(0, 500) };
  } finally {
    try { unlinkSync(tmpScript); } catch {}
  }
}

// ── Server ───────────────────────────────────────────────────────────────────
async function startServer() {
  const proc = spawn('python3', ['reportforge_server.py', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', () => {});
  proc.stdout.on('data', () => {});
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}health`); if (r.ok) return proc; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error('server did not start within timeout');
}

// ── Single-browser measurement (Layer 1 + 2 + screenshot) ────────────────────
async function measureInBrowser(browserType, browserName) {
  const browser = await browserType.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(`PAGEERROR: ${e.message}`));

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: TIMEOUT });

    // Wait for full runtime boot (DS loaded + rulers rendered)
    await page.waitForFunction(
      () => typeof RF !== 'undefined' && RF.RuntimeConfig &&
            typeof DS !== 'undefined' && Array.isArray(DS.sections) && DS.sections.length > 0,
      { timeout: TIMEOUT },
    );
    await page.waitForFunction(
      () => {
        const h = document.getElementById('ruler-h-inner');
        const v = document.getElementById('ruler-v-inner');
        return h && v && h.width > 0 && v.height > 0;
      },
      { timeout: TIMEOUT },
    );
    await page.waitForTimeout(500); // settle pending rAF

    // Layer 1: BCR geometry
    const geo = await page.evaluate(MEASURE_SCRIPT);

    // Layer 2: Canvas draw audit
    const canvasAudit = await page.evaluate(CANVAS_AUDIT_SCRIPT);

    // Screenshot for Layer 3
    const ssBuffer = await page.screenshot({ fullPage: false });
    const ssPath = path.join(tmpdir(), `rf_ss_${browserName.toLowerCase()}_${Date.now()}.png`);
    writeFileSync(ssPath, ssBuffer);

    return { geo, canvasAudit, consoleErrors, screenshotPath: ssPath };
  } finally {
    await browser.close();
  }
}

// ── Layer 1: Invariant checks ─────────────────────────────────────────────────
function checkBCRInvariants(geo) {
  const violations = [];
  const log        = [];

  const pass = (id, desc)           => log.push(`   ✅  ${id}  ${desc}`);
  const fail = (id, desc, detail)   => { log.push(`   ❌  ${id}  ${desc}`); violations.push({ id, desc, detail }); };
  const inv  = (id, ok, desc, det)  => ok ? pass(id, desc) : fail(id, desc, det);

  const { dpr, runtimeConfig, topRuler, sideRuler, corner } = geo;

  const tH  = topRuler.containerRect.h;
  const sW  = sideRuler.containerRect.w;
  const cW  = corner.rect.w;
  const cH  = corner.rect.h;
  const tCH = topRuler.canvasRect.h;
  const sCW = sideRuler.canvasRect.w;
  const tBH = topRuler.canvasBitmap.h;
  const sBW = sideRuler.canvasBitmap.w;
  const expTBH = Math.round(tH * dpr);
  const expSBW = Math.round(sW * dpr);
  const hSX = topRuler.transform.scaleX,  hSY = topRuler.transform.scaleY;
  const vSX = sideRuler.transform.scaleX, vSY = sideRuler.transform.scaleY;

  inv('INV-1 ', Math.abs(tH - sW) <= TOL,
    `topRuler.h (${tH.toFixed(1)}) ≈ sideRuler.w (${sW.toFixed(1)})  [±${TOL}px]`,
    `ASYMMETRY: topRuler.h=${tH.toFixed(2)} sideRuler.w=${sW.toFixed(2)} diff=${Math.abs(tH-sW).toFixed(2)}px`);

  inv('INV-2 ', Math.abs(cW - sW) <= TOL,
    `corner.w (${cW.toFixed(1)}) ≈ sideRuler.w (${sW.toFixed(1)})`,
    `corner.w=${cW.toFixed(2)} sideRuler.w=${sW.toFixed(2)}`);

  inv('INV-3 ', Math.abs(cH - tH) <= TOL,
    `corner.h (${cH.toFixed(1)}) ≈ topRuler.h (${tH.toFixed(1)})`,
    `corner.h=${cH.toFixed(2)} topRuler.h=${tH.toFixed(2)}`);

  inv('INV-4 ', Math.abs(tCH - tH) <= TOL,
    `hCanvas CSS h (${tCH.toFixed(1)}) fills container h (${tH.toFixed(1)})`,
    `canvas CSS h=${tCH.toFixed(2)} container=${tH.toFixed(2)}`);

  inv('INV-5 ', Math.abs(sCW - sW) <= TOL,
    `vCanvas CSS w (${sCW.toFixed(1)}) fills container w (${sW.toFixed(1)})`,
    `canvas CSS w=${sCW.toFixed(2)} container=${sW.toFixed(2)}`);

  inv('INV-6 ', Math.abs(tBH - expTBH) <= 1,
    `hCanvas bitmap h (${tBH}) = containerH×DPR (${tH.toFixed(0)}×${dpr}=${expTBH})`,
    `bitmap.h=${tBH} expected=${expTBH} — blurry or misaligned canvas`);

  inv('INV-7 ', Math.abs(sBW - expSBW) <= 1,
    `vCanvas bitmap w (${sBW}) = containerW×DPR (${sW.toFixed(0)}×${dpr}=${expSBW})`,
    `bitmap.w=${sBW} expected=${expSBW} — blurry or misaligned canvas`);

  inv('INV-8 ', !topRuler.clip.clipped,
    `#ruler-h-inner not clipped by overflow:hidden ancestor`,
    `clipped by [${topRuler.clip.by}] parentRect=${JSON.stringify(topRuler.clip.parentRect)}`);

  inv('INV-8b', !sideRuler.clip.clipped,
    `#ruler-v-inner not clipped by overflow:hidden ancestor`,
    `clipped by [${sideRuler.clip.by}] parentRect=${JSON.stringify(sideRuler.clip.parentRect)}`);

  inv('INV-9 ', Math.abs(hSX - 1) < 0.01 && Math.abs(hSY - 1) < 0.01,
    `#ruler-h-row no distorting transform (scaleX=${hSX} scaleY=${hSY})`,
    `transform=${topRuler.transform.raw}`);

  inv('INV-9b', Math.abs(vSX - 1) < 0.01 && Math.abs(vSY - 1) < 0.01,
    `#ruler-v no distorting transform (scaleX=${vSX} scaleY=${vSY})`,
    `transform=${sideRuler.transform.raw}`);

  if (runtimeConfig) {
    inv('INV-10', Math.abs(runtimeConfig.topPx - tH) <= TOL,
      `RuntimeConfig.ruler.topPx (${runtimeConfig.topPx}) = rendered topRuler.h (${tH.toFixed(1)})`,
      `config=${runtimeConfig.topPx} rendered=${tH.toFixed(2)} — JS contract diverges from CSS layout`);

    inv('INV-11', Math.abs(runtimeConfig.sidePx - sW) <= TOL,
      `RuntimeConfig.ruler.sidePx (${runtimeConfig.sidePx}) = rendered sideRuler.w (${sW.toFixed(1)})`,
      `config=${runtimeConfig.sidePx} rendered=${sW.toFixed(2)} — JS contract diverges from CSS layout`);
  } else {
    fail('INV-10', 'RF.RuntimeConfig not found on window', 'script load order broken');
    fail('INV-11', 'RF.RuntimeConfig not found on window', 'script load order broken');
  }

  return { violations, log,
           tH, sW, cW, cH, dpr, tBH, sBW };
}

// ── Layer 3: Pixel painting invariants ───────────────────────────────────────
function checkPixelInvariants(pixelData, sW) {
  const violations = [];
  const log        = [];
  const pass = (id, desc)         => log.push(`   ✅  ${id}  ${desc}`);
  const fail = (id, desc, detail) => { log.push(`   ❌  ${id}  ${desc}`); violations.push({ id, desc, detail }); };

  if (!pixelData.ok) {
    fail('INV-12', 'Python pixel analysis failed — cannot verify visual symmetry', pixelData.error ?? '');
    fail('INV-13', 'Python pixel analysis failed — cannot verify vertical ruler paint', pixelData.error ?? '');
    return { violations, log };
  }

  const { paintedTopThickness: pTop, paintedSideThickness: pSide } = pixelData;
  const diff = Math.abs(pTop - pSide);

  const sym12 = diff <= 1;
  const sym13 = pSide >= 20;

  if (sym12) {
    pass('INV-12', `|paintedTopThickness(${pTop}) − paintedSideThickness(${pSide})| = ${diff} ≤ 1  (visual symmetry)`);
  } else {
    fail('INV-12',
      `VISUAL ASYMMETRY: paintedTop=${pTop}px  paintedSide=${pSide}px  diff=${diff}px  (expected ≤1)`,
      `Horizontal ruler paints ${pTop}px, vertical paints ${pSide}px in screenshot. ` +
      (pTop > pSide
        ? `Horizontal appears THICKER. Check: horizontal canvas clearRect/draw area, top border/padding.`
        : `Vertical appears THICKER. Check: vertical canvas clearRect/draw area, side border/padding.`));
  }

  if (sym13) {
    pass('INV-13', `paintedSideThickness (${pSide}px) ≥ 20px  (vertical ruler not underpainted)`);
  } else {
    fail('INV-13',
      `Vertical ruler container=${sW.toFixed(0)}px BUT painted content=${pSide}px < 20px`,
      `Audit: #ruler-v-inner canvas.width=${pSide < 10 ? '(very narrow — check _setupCanvas)' : 'ok'}, ` +
      `ctx.setTransform may not be scaling to full bitmap, or clearRect is clipping draw area.`);
  }

  return { violations, log };
}

// ── Print Layer 1 measurements ────────────────────────────────────────────────
function printMeasurements(geo, browserName) {
  const { dpr, runtimeConfig, topRuler, sideRuler, corner } = geo;
  const pad = s => s.padEnd(44);
  const row = (label, val) => console.log(`   ${pad(label)} ${val}`);

  console.log(`\n   ── ${browserName} BCR measurements ───────────────────────────`);
  row('devicePixelRatio',               String(dpr));
  row('RF.RuntimeConfig.ruler.topPx',   runtimeConfig ? String(runtimeConfig.topPx)  : '⚠ NOT FOUND');
  row('RF.RuntimeConfig.ruler.sidePx',  runtimeConfig ? String(runtimeConfig.sidePx) : '⚠ NOT FOUND');
  row('#ruler-h-row  container h',      `${topRuler.containerRect.h.toFixed(2)} px`);
  row('#ruler-v      container w',      `${sideRuler.containerRect.w.toFixed(2)} px`);
  row('#ruler-corner rect (w × h)',     `${corner.rect.w.toFixed(2)} × ${corner.rect.h.toFixed(2)} px`);
  row('#ruler-h-inner canvas CSS h',    `${topRuler.canvasRect.h.toFixed(2)} px`);
  row('#ruler-h-inner bitmap h',        `${topRuler.canvasBitmap.h} px  (style.h: ${topRuler.canvasStyleSize.h || 'unset'})`);
  row('#ruler-v-inner canvas CSS w',    `${sideRuler.canvasRect.w.toFixed(2)} px`);
  row('#ruler-v-inner bitmap w',        `${sideRuler.canvasBitmap.w} px  (style.w: ${sideRuler.canvasStyleSize.w || 'unset'})`);
  row('#ruler-h-row  transform',        topRuler.transform.raw);
  row('#ruler-v      transform',        sideRuler.transform.raw);
  row('#ruler-h-inner clip',            topRuler.clip.clipped  ? `⚠ clipped by ${topRuler.clip.by}`  : 'none');
  row('#ruler-v-inner clip',            sideRuler.clip.clipped ? `⚠ clipped by ${sideRuler.clip.by}` : 'none');
}

// ── Print Layer 2 canvas audit ────────────────────────────────────────────────
function printCanvasAudit(audit, browserName) {
  const fmt = v => v !== null && v !== undefined ? String(v) : '—';
  const row = (label, val) => console.log(`   ${label.padEnd(44)} ${val}`);
  const fmtTransform = t => {
    if (!t) return '(unavailable)';
    // scaleX=a, scaleY=d, skewX=c, skewY=b, transX=e, transY=f
    const issues = [];
    if (Math.abs(t.a - 1) > 0.05 || Math.abs(t.d - 1) > 0.05)
      issues.push(`scale ${t.a}×${t.d}`);
    if (Math.abs(t.b) > 0.01 || Math.abs(t.c) > 0.01)
      issues.push(`skew b=${t.b} c=${t.c}`);
    if (Math.abs(t.e) > 0.5 || Math.abs(t.f) > 0.5)
      issues.push(`translate e=${t.e} f=${t.f}`);
    const base = `a=${t.a} b=${t.b} c=${t.c} d=${t.d} e=${t.e} f=${t.f}`;
    return issues.length ? `${base}  ⚠ ${issues.join(', ')}` : `${base}  ✓ identity`;
  };

  const h = audit.hCanvas ?? {};
  const v = audit.vCanvas ?? {};

  console.log(`\n   ── ${browserName} canvas draw audit (Layer 2) ───────────────`);
  row('hCanvas bitmap (w × h)',   h.error ? `⚠ ${h.error}` : `${h.bitmapW} × ${h.bitmapH}`);
  row('hCanvas style w/h',        h.error ? '—' : `${h.styleW} / ${h.styleH}`);
  row('hCanvas ctx.getTransform', h.error ? '—' : fmtTransform(h.transform));
  row('hCanvas painted span (rows)', h.error ? '—' : `${fmt(h.paintedMin)}…${fmt(h.paintedMax)}  (${h.paintedSpan} bitmap px)`);

  row('vCanvas bitmap (w × h)',   v.error ? `⚠ ${v.error}` : `${v.bitmapW} × ${v.bitmapH}`);
  row('vCanvas style w/h',        v.error ? '—' : `${v.styleW} / ${v.styleH}`);
  row('vCanvas ctx.getTransform', v.error ? '—' : fmtTransform(v.transform));
  row('vCanvas painted span (cols)', v.error ? '—' : `${fmt(v.paintedMin)}…${fmt(v.paintedMax)}  (${v.paintedSpan} bitmap px)`);
}

// ── Print Layer 3 pixel results ───────────────────────────────────────────────
function printPixelResults(px, debugPngPath, browserName) {
  const row = (label, val) => console.log(`   ${label.padEnd(44)} ${val}`);
  console.log(`\n   ── ${browserName} screenshot pixel analysis (Layer 3) ────────`);
  if (!px.ok) {
    console.log(`   ⚠  pixel analysis error: ${px.error}`);
    if (px.stderr) console.log(`      stderr: ${px.stderr}`);
    return;
  }
  row('screenshot size (px)',         `${px.imgSize[0]} × ${px.imgSize[1]}`);
  row('scan column x (h ruler)',      String(px.hCenterX));
  row('scan row    y (v ruler)',       String(px.vCenterY));
  row('paintedTopThickness',          `${px.paintedTopThickness} px  (y ${px.paintedTopY0}…${px.paintedTopY1})`);
  row('paintedSideThickness',         `${px.paintedSideThickness} px  (x ${px.paintedSideX0}…${px.paintedSideX1})`);
  console.log(`   debug PNG → ${debugPngPath}`);
}

// ── Root-cause diagnosis ──────────────────────────────────────────────────────
function diagnoseFail(violations, geo) {
  const inv1 = violations.find(v => v.id.startsWith('INV-1'));
  if (!inv1) return;
  const tH = geo.topRuler.containerRect.h;
  const sW = geo.sideRuler.containerRect.w;
  console.log('\n   🩺 Root-cause analysis (INV-1 FAIL):');
  if (tH > sW) {
    console.log(`   Horizontal ruler renders TALLER (${tH.toFixed(1)}px) than vertical is wide (${sW.toFixed(1)}px).`);
    console.log('   · Is --rf-ruler-top applied to #ruler-h-row? (check canvas.css block-size)');
    console.log('   · Did H_RULER_H in RulerEngine drift from RuntimeConfig.ruler.topPx?');
    console.log('   · Does any other CSS rule override #ruler-h-row height?');
  } else {
    console.log(`   Vertical ruler renders WIDER (${sW.toFixed(1)}px) than horizontal is tall (${tH.toFixed(1)}px).`);
    console.log('   · Is --rf-ruler-side applied to #ruler-v? (check canvas.css inline-size)');
    console.log('   · Did V_TOTAL_W in RulerEngine drift from RuntimeConfig.ruler.sidePx?');
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
const SEP = '─'.repeat(64);
let server = null;

try {
  console.log(`\n${SEP}`);
  console.log('🔬  Ruler Rendered Geometry Guard  ·  Chromium + Firefox');
  console.log(`    URL    : ${BASE}`);
  console.log(`    Viewport: 1440×980`);
  console.log(SEP);

  // Print SSOT file hashes so any silent file change is visible in CI logs
  const KEY_FILES = [
    'engines/RuntimeConfig.js',
    'designer/styles/tokens.css',
    'designer/styles/canvas.css',
  ];
  console.log('\n   SSOT file SHA-256 (first 16 hex chars):');
  for (const f of KEY_FILES) {
    console.log(`   ${f.padEnd(42)} ${sha256short(f)}`);
  }

  process.stdout.write('\n   Starting server … ');
  server = await startServer();
  console.log('ready');

  // Launch both browsers in parallel
  process.stdout.write('   Launching Chromium + Firefox in parallel … ');
  const [chromiumResult, firefoxResult] = await Promise.allSettled([
    measureInBrowser(chromium, 'Chromium'),
    measureInBrowser(firefox,  'Firefox'),
  ]);
  console.log('done\n');

  // ── Process results ──────────────────────────────────────────────────────
  const BROWSERS = [
    { name: 'Chromium', result: chromiumResult },
    { name: 'Firefox',  result: firefoxResult  },
  ];

  let totalViolations = 0;
  const browserSummaries = [];

  for (const { name, result } of BROWSERS) {
    console.log(`${SEP}`);
    console.log(`🌐  ${name}`);
    console.log(SEP);

    if (result.status === 'rejected') {
      console.log(`   ❌  LAUNCH ERROR: ${result.reason?.message}`);
      browserSummaries.push({ name, status: 'ERROR', violations: 1, error: result.reason?.message });
      totalViolations++;
      continue;
    }

    const { geo, canvasAudit, consoleErrors, screenshotPath } = result.value;

    if (geo.error) {
      console.log(`   ❌  DOM ERROR: ${geo.error}`);
      browserSummaries.push({ name, status: 'ERROR', violations: 1, error: geo.error });
      totalViolations++;
      continue;
    }

    // Layer 1 output
    printMeasurements(geo, name);
    const { violations: bcrViol, log: bcrLog, tH, sW } = checkBCRInvariants(geo);
    console.log(`\n   ── ${name} invariants (Layer 1 — BCR) ──────────────────────`);
    for (const line of bcrLog) console.log(line);
    if (bcrViol.length > 0) diagnoseFail(bcrViol, geo);

    // Layer 2 output
    printCanvasAudit(canvasAudit, name);

    // Layer 3: run Python pixel analysis
    const debugPng = `/tmp/rf_ruler_debug_${name.toLowerCase()}.png`;
    const bcrPayload = {
      dpr:    geo.dpr,
      hRow:   geo.topRuler.containerRect,
      vCol:   geo.sideRuler.containerRect,
      hInner: geo.topRuler.canvasRect,
      vInner: geo.sideRuler.canvasRect,
    };
    const pixelData = analyzePixels(screenshotPath, bcrPayload, debugPng);
    printPixelResults(pixelData, debugPng, name);

    const { violations: pxViol, log: pxLog } = checkPixelInvariants(pixelData, sW);
    console.log(`\n   ── ${name} invariants (Layer 3 — pixel paint) ───────────────`);
    for (const line of pxLog) console.log(line);

    // Clean up temp screenshot
    try { unlinkSync(screenshotPath); } catch {}

    if (consoleErrors.length > 0) {
      console.log(`\n   ⚠  ${consoleErrors.length} browser console error(s):`);
      consoleErrors.slice(0, 3).forEach(e => console.log(`      ${e.slice(0, 120)}`));
    }

    const allViol = [...bcrViol, ...pxViol];
    if (allViol.length > 0) {
      console.log(`\n   ── ${name} violation details (${allViol.length}) ────────────────────`);
      for (const v of allViol) {
        console.log(`   ❌  ${v.id}  ${v.desc}`);
        console.log(`        ${v.detail}`);
      }
    }

    totalViolations += allViol.length;
    browserSummaries.push({
      name,
      status: allViol.length === 0 ? 'PASS' : 'FAIL',
      violations: allViol.length,
      tH, sW,
      paintedTop:  pixelData.paintedTopThickness,
      paintedSide: pixelData.paintedSideThickness,
    });
  }

  // ── Cross-browser consistency ─────────────────────────────────────────────
  const measured = browserSummaries.filter(b => b.tH !== undefined);
  if (measured.length === 2) {
    const [a, b] = measured;
    const crossDiffTop  = Math.abs(a.tH - b.tH);
    const crossDiffSide = Math.abs(a.sW - b.sW);
    const crossOk = crossDiffTop <= TOL && crossDiffSide <= TOL;

    console.log(`\n${SEP}`);
    console.log('🔀  Cross-browser consistency');
    console.log(SEP);
    const sym = ok => ok ? '✅' : '❌';
    console.log(`   ${sym(crossDiffTop  <= TOL)}  topRuler.h :  Chromium=${a.tH.toFixed(1)}  Firefox=${b.tH.toFixed(1)}  diff=${crossDiffTop.toFixed(2)}px`);
    console.log(`   ${sym(crossDiffSide <= TOL)}  sideRuler.w: Chromium=${a.sW.toFixed(1)}  Firefox=${b.sW.toFixed(1)}  diff=${crossDiffSide.toFixed(2)}px`);
    if (a.paintedTop !== undefined && b.paintedTop !== undefined) {
      const pTopDiff  = Math.abs(a.paintedTop  - b.paintedTop);
      const pSideDiff = Math.abs(a.paintedSide - b.paintedSide);
      console.log(`   ${sym(pTopDiff  <= 1)}  paintedTop : Chromium=${a.paintedTop}  Firefox=${b.paintedTop}  diff=${pTopDiff}px`);
      console.log(`   ${sym(pSideDiff <= 1)}  paintedSide: Chromium=${a.paintedSide}  Firefox=${b.paintedSide}  diff=${pSideDiff}px`);
    }
    if (!crossOk) {
      totalViolations++;
      console.log('   ❌  Cross-browser BCR ruler dimensions diverge — rendering is browser-dependent.');
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('📋  Summary');
  console.log(SEP);
  for (const s of browserSummaries) {
    const sym  = s.status === 'PASS' ? '✅' : '❌';
    const geo  = s.tH !== undefined ? `topH=${s.tH?.toFixed(1)} sideW=${s.sW?.toFixed(1)}` : '';
    const paint = s.paintedTop !== undefined
      ? `  paintedTop=${s.paintedTop} paintedSide=${s.paintedSide}` : '';
    const detail = s.status === 'PASS'
      ? `${geo}${paint}`
      : s.error ?? `${s.violations} violation(s)  ${geo}${paint}`;
    console.log(`   ${sym}  ${s.name.padEnd(10)} ${s.status.padEnd(6)}  ${detail}`);
  }
  console.log('');

  if (totalViolations === 0) {
    console.log(`✅  PASS — All ruler geometry invariants satisfied in Chromium and Firefox.`);
    console.log(SEP);
    server.kill('SIGINT');
    process.exit(0);
  } else {
    console.log(`❌  FAIL — ${totalViolations} violation(s) across browsers.`);
    console.log('   Layer 1 fix : ensure --rf-ruler-top / --rf-ruler-side tokens apply to containers.');
    console.log('   Layer 3 fix : ensure canvas clearRect + draw commands cover the full bitmap area.');
    console.log('   Debug PNGs  : /tmp/rf_ruler_debug_chromium.png  /tmp/rf_ruler_debug_firefox.png');
    console.log(SEP);
    server.kill('SIGINT');
    process.exit(1);
  }

} catch (err) {
  console.error(`\n❌  INFRA ERROR — ${err.message}`);
  if (server) server.kill('SIGINT');
  process.exit(2);
}
