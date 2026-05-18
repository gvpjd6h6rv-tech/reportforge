#!/usr/bin/env node
/**
 * pixel-contracts.mjs — Generic Pixel Contract Testing
 *
 * Declarative geometry contracts for any UI component in a real browser.
 * Extracted from audit/ruler_rendered_geometry_guard.mjs.
 *
 * Contract shape:
 *   {
 *     name:      string,
 *     selector?: string,         // CSS selector — required for standard checks
 *     expected?: {
 *       widthPx?:         number,
 *       heightPx?:        number,
 *       width?:           "fill-parent",
 *       height?:          "fill-parent",
 *       overflow?:        "none",
 *       transform?:       { maxScaleDeviation?: number },   // default 0.01
 *       maxTolerancePx?:  number,                           // default 1.5
 *       canvas?: {
 *         backingStore?:  true,    // bitmap.wh = cssWH × DPR
 *         paintedArea?:   { axis?: "h"|"v", minSpanPx?: number },
 *       },
 *       pixelScan?: {
 *         axis:                   "h"|"v",
 *         minPaintedThicknessPx?: number,
 *         bgColor?:               [number, number, number],
 *         bgTolerance?:           number,
 *       },
 *     },
 *     custom?: (measurements, pixelRegions, context) => Violation[],
 *   }
 *
 * Usage:
 *   import { runContracts } from './pixel-contracts.mjs';
 *   const { violations } = await runContracts(page, contracts, {
 *     artifactsDir: '/tmp/myapp-artifacts',
 *     label:        'chromium',
 *     context:      await page.evaluate(() => ({ myConfig: window.MyApp?.config })),
 *   });
 */

import { execFileSync }             from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir }                    from 'node:os';
import path                          from 'node:path';

export const DEFAULT_TOLERANCE_PX = 1.5;

// ── Infra vs contract violation classification ────────────────────────────────
//
// Infrastructure violations mean the measurement/scan machinery itself failed:
// we have no data → no conclusion is possible → build MUST be red unconditionally.
//
// Contract violations mean the machinery ran but the element broke a declared rule.
//
// Core infra IDs (emitted by this module):
export const INFRA_VIOLATION_IDS = Object.freeze(new Set([
  'MEASURE-MISSING',    // selector absent from measurements map entirely
  'MEASURE-ERROR',      // DOM element not found or BCR threw
  'PIXEL-SCAN-FAILED',  // screenshot/Python infrastructure failed
  'PIXEL-SCAN-MISSING', // scan ran but this region was not collected
]));

// Custom validators (e.g. ruler_pixel_contracts.mjs) emit measurement-gap
// violations with ids ending in '-MEASURE' or configuration-error ids ending
// in '-TYPE'.  These are also unconditional infra failures.
const INFRA_SUFFIXES = ['-MEASURE', '-TYPE'];

/** Returns true when the violation represents an infrastructure failure. */
export function isInfraViolation(v) {
  return INFRA_VIOLATION_IDS.has(v.id) ||
    INFRA_SUFFIXES.some(s => v.id.endsWith(s));
}

/**
 * classifyViolations(violations)
 * → { infra: Violation[], contract: Violation[] }
 *
 * infra    — measurement/scan infrastructure could not run; result is unknown.
 *            Strict CI gate: any infra violation = immediate build failure.
 * contract — infrastructure ran; element broke a declared geometry rule.
 */
export function classifyViolations(violations) {
  const infra    = violations.filter(isInfraViolation);
  const contract = violations.filter(v => !isInfraViolation(v));
  return { infra, contract };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 1 — In-browser BCR measurement
// Serialised by Playwright and executed inside the browser context.
// Returns Record<selector, Measurement>.
// ═══════════════════════════════════════════════════════════════════════════════

function _measureInBrowser(selectors) {
  function bcr(el) {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }
  function parseTransform(el) {
    const t = window.getComputedStyle(el).transform;
    if (!t || t === 'none') return { scaleX: 1, scaleY: 1, raw: 'none' };
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return { scaleX: 1, scaleY: 1, raw: t };
    const p = m[1].split(',').map(Number);
    return { scaleX: p[0], scaleY: p[3], raw: t };
  }
  function clippingAncestor(el) {
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const s = window.getComputedStyle(cur);
      if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') {
        const cr = cur.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        if (cr.height < er.height - 2 || cr.width < er.width - 2)
          return {
            clipped:    true,
            by:         cur.id || cur.className || cur.tagName,
            parentRect: { w: cr.width,  h: cr.height },
            elRect:     { w: er.width,  h: er.height },
          };
      }
      cur = cur.parentElement;
    }
    return { clipped: false };
  }

  const dpr     = window.devicePixelRatio;
  const results = {};

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) { results[sel] = { error: `element not found: ${sel}` }; continue; }

    const parent = el.parentElement;
    let canvas = null;
    if (el.tagName === 'CANVAS') {
      canvas = {
        bitmapW: el.width,
        bitmapH: el.height,
        styleW:  el.style.width  || '',
        styleH:  el.style.height || '',
      };
    }

    results[sel] = {
      dpr,
      rect:       bcr(el),
      parentRect: parent ? bcr(parent) : null,
      transform:  parseTransform(el),
      clip:       clippingAncestor(el),
      canvas,
      tagName:    el.tagName,
    };
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 2 — In-browser canvas draw audit (getImageData bitmap pixel scan)
// Extracted from ruler_rendered_geometry_guard.mjs CANVAS_AUDIT_SCRIPT.
// Returns Record<selector, CanvasAudit>.
// ═══════════════════════════════════════════════════════════════════════════════

function _canvasAuditInBrowser(audits) {
  const results = {};

  for (const { selector, axis } of audits) {
    const canvas = document.querySelector(selector);
    if (!canvas || canvas.tagName !== 'CANVAS') {
      results[selector] = { error: 'not a canvas' }; continue;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) { results[selector] = { error: 'no 2d context' }; continue; }

    const tm = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const transform = tm
      ? { a: +tm.a.toFixed(4), b: +tm.b.toFixed(4),
          c: +tm.c.toFixed(4), d: +tm.d.toFixed(4),
          e: +tm.e.toFixed(2),  f: +tm.f.toFixed(2) }
      : null;

    const W = canvas.width, H = canvas.height;
    let paintedMin = null, paintedMax = null;

    try {
      if (axis === 'h') {
        const data = ctx.getImageData(Math.floor(W / 2), 0, 1, H).data;
        for (let y = 0; y < H; y++) {
          const r = data[y*4], g = data[y*4+1], b = data[y*4+2], a = data[y*4+3];
          if (a > 10 && !(r > 245 && g > 245 && b > 245)) {
            if (paintedMin === null) paintedMin = y;
            paintedMax = y;
          }
        }
      } else {
        const data = ctx.getImageData(0, Math.floor(H / 2), W, 1).data;
        for (let x = 0; x < W; x++) {
          const r = data[x*4], g = data[x*4+1], b = data[x*4+2], a = data[x*4+3];
          if (a > 10 && !(r > 245 && g > 245 && b > 245)) {
            if (paintedMin === null) paintedMin = x;
            paintedMax = x;
          }
        }
      }
    } catch {
      results[selector] = { error: 'getImageData failed', transform }; continue;
    }

    results[selector] = {
      bitmapW: W, bitmapH: H, transform, axis,
      paintedMin, paintedMax,
      paintedSpan: paintedMin !== null ? paintedMax - paintedMin + 1 : 0,
    };
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 3 — Python PIL screenshot pixel scanner
// Generalised from ruler_rendered_geometry_guard.mjs Layer 3 / PYTHON_PIXEL_ANALYZER.
// Accepts N generic scan regions instead of the two hardcoded ruler regions.
// ═══════════════════════════════════════════════════════════════════════════════

const PYTHON_PIXEL_SCANNER = `
import sys, json
from PIL import Image, ImageDraw

args    = json.loads(sys.argv[1])
img     = Image.open(args['imgPath']).convert('RGB')
px      = img.load()
W, H    = img.size
dpr     = float(args.get('dpr', 1))
regions = args['regions']
out     = args['outPath']

def css2ss(v):
    return max(0, int(round(float(v) * dpr)))

def is_bg(r, g, b, bg, tol):
    # bg=None: treat white/near-white as background (matches canvas audit logic)
    if bg is None:
        return r > 245 and g > 245 and b > 245
    return abs(r - bg[0]) <= tol and abs(g - bg[1]) <= tol and abs(b - bg[2]) <= tol

draw    = ImageDraw.Draw(img)
results = {}

for region in regions:
    name = region['name']
    rect = region['rect']
    axis = region.get('axis', 'h')
    bg   = region.get('bgColor', None)
    tol  = region.get('bgTolerance', 15)

    rx0 = min(css2ss(rect['x']),              W - 1)
    ry0 = min(css2ss(rect['y']),              H - 1)
    rx1 = min(css2ss(rect['x'] + rect['w']),  W - 1)
    ry1 = min(css2ss(rect['y'] + rect['h']),  H - 1)

    thickness   = 0
    painted_min = None
    painted_max = None

    if axis == 'h':
        cx = max(0, min((rx0 + rx1) // 2, W - 1))
        for y in range(ry0, ry1):
            r2, g2, b2 = px[cx, y]
            if not is_bg(r2, g2, b2, bg, tol):
                if painted_min is None: painted_min = y
                painted_max = y
                thickness  += 1
        draw.line([cx, ry0, cx, ry1], fill=(255, 140, 0), width=1)
    else:
        cy = max(0, min((ry0 + ry1) // 2, H - 1))
        for x in range(rx0, rx1):
            r2, g2, b2 = px[x, cy]
            if not is_bg(r2, g2, b2, bg, tol):
                if painted_min is None: painted_min = x
                painted_max = x
                thickness  += 1
        draw.line([rx0, cy, rx1, cy], fill=(0, 200, 255), width=1)

    # annotate BCR box + painted extent
    draw.rectangle([rx0, ry0, rx1, ry1], outline=(255, 255, 0), width=1)
    if painted_min is not None and painted_max is not None:
        if axis == 'h':
            cx_l = max(0, cx - 30)
            cx_r = min(W - 1, cx + 30)
            draw.rectangle([cx_l, painted_min, cx_r, painted_max], outline=(255, 0, 220), width=2)
        else:
            cy_t = max(0, cy - 30)
            cy_b = min(H - 1, cy + 30)
            draw.rectangle([painted_min, cy_t, painted_max, cy_b], outline=(255, 0, 220), width=2)

    results[name] = {
        'paintedThickness': thickness,
        'paintedMin':       painted_min,
        'paintedMax':       painted_max,
    }

img.save(out)
print(json.dumps({'imgSize': [W, H], 'regions': results}))
`;

/**
 * analyzePixelRegions(screenshotPath, regions, debugPngPath)
 *
 * regions: Array<{ name, rect:{x,y,w,h}, axis:"h"|"v", bgColor?:[r,g,b], bgTolerance? }>
 * Saves annotated debug PNG to debugPngPath.
 * Returns { ok, imgSize, regions: Record<name, {paintedThickness, paintedMin, paintedMax}> }
 */
export function analyzePixelRegions(screenshotPath, regions, debugPngPath) {
  const script = path.join(tmpdir(), `pxc_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  writeFileSync(script, PYTHON_PIXEL_SCANNER, 'utf8');
  try {
    const payload = JSON.stringify({
      imgPath:  screenshotPath,
      regions,
      outPath:  debugPngPath,
    });
    const out = execFileSync('python3', [script, payload], { encoding: 'utf8', timeout: 20_000 });
    return { ok: true, ...JSON.parse(out.trim()) };
  } catch (err) {
    return { ok: false, error: err.message, stderr: (err.stderr ?? '').slice(0, 500) };
  } finally {
    try { unlinkSync(script); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Contract evaluator
// Pure function — no I/O, no Playwright.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * evaluateContract(contract, allMeasurements, canvasAudits?, pixelData?, context?)
 * → Violation[]
 *
 * Violation: { contract: string, id: string, detail: string }
 */
export function evaluateContract(contract, allMeasurements, canvasAudits = null, pixelData = null, context = null) {
  const violations = [];

  // custom validator — handles cross-element comparisons, app-specific checks
  if (typeof contract.custom === 'function') {
    const result = contract.custom(allMeasurements, pixelData?.regions ?? {}, context);
    // Detect async validators early with a specific message before the array check.
    if (result !== null && typeof result === 'object' && typeof result.then === 'function')
      throw new TypeError(`contract "${contract.name}": custom() must be synchronous, got Promise`);
    // Non-array return (including null) is a bug in the validator — not a silent pass.
    // Returning null instead of [] would swallow all violations; reject it explicitly.
    if (!Array.isArray(result))
      throw new TypeError(`contract "${contract.name}": custom() must return Violation[], got ${result === null ? 'null' : typeof result}`);
    for (const v of result) violations.push({ contract: contract.name, ...v });
  }

  if (!contract.selector || !contract.expected) return violations;

  const m = allMeasurements[contract.selector];
  if (!m) {
    violations.push({ contract: contract.name, id: 'MEASURE-MISSING',
      detail: `no measurement for selector: ${contract.selector}` });
    return violations;
  }
  if (m.error) {
    violations.push({ contract: contract.name, id: 'MEASURE-ERROR', detail: m.error });
    return violations;
  }

  const { expected }                        = contract;
  const tol                                  = expected.maxTolerancePx ?? DEFAULT_TOLERANCE_PX;
  const { rect, parentRect, clip, canvas, dpr } = m;

  // ── Dimension checks ────────────────────────────────────────────────────────

  if (expected.heightPx !== undefined) {
    const diff = Math.abs(rect.h - expected.heightPx);
    if (diff > tol) violations.push({ contract: contract.name, id: 'HEIGHT',
      detail: `expected ${expected.heightPx}px ±${tol}, got ${rect.h.toFixed(2)}px (Δ${diff.toFixed(2)}px)` });
  }

  if (expected.widthPx !== undefined) {
    const diff = Math.abs(rect.w - expected.widthPx);
    if (diff > tol) violations.push({ contract: contract.name, id: 'WIDTH',
      detail: `expected ${expected.widthPx}px ±${tol}, got ${rect.w.toFixed(2)}px (Δ${diff.toFixed(2)}px)` });
  }

  if (expected.width === 'fill-parent') {
    if (!parentRect) {
      violations.push({ contract: contract.name, id: 'FILL-PARENT-WIDTH', detail: 'no parent element' });
    } else {
      const diff = Math.abs(rect.w - parentRect.w);
      if (diff > tol) violations.push({ contract: contract.name, id: 'FILL-PARENT-WIDTH',
        detail: `expected fill-parent (${parentRect.w.toFixed(2)}px) ±${tol}, got ${rect.w.toFixed(2)}px (Δ${diff.toFixed(2)}px)` });
    }
  }

  if (expected.height === 'fill-parent') {
    if (!parentRect) {
      violations.push({ contract: contract.name, id: 'FILL-PARENT-HEIGHT', detail: 'no parent element' });
    } else {
      const diff = Math.abs(rect.h - parentRect.h);
      if (diff > tol) violations.push({ contract: contract.name, id: 'FILL-PARENT-HEIGHT',
        detail: `expected fill-parent (${parentRect.h.toFixed(2)}px) ±${tol}, got ${rect.h.toFixed(2)}px (Δ${diff.toFixed(2)}px)` });
    }
  }

  // ── Overflow / clipping ──────────────────────────────────────────────────────

  if (expected.overflow === 'none') {
    if (clip.clipped) violations.push({ contract: contract.name, id: 'OVERFLOW',
      detail: `clipped by [${clip.by}]  parentRect=${JSON.stringify(clip.parentRect)}` });
  }

  // ── CSS transform ────────────────────────────────────────────────────────────

  if (expected.transform) {
    const maxDev = expected.transform.maxScaleDeviation ?? 0.01;
    if (Math.abs(m.transform.scaleX - 1) > maxDev || Math.abs(m.transform.scaleY - 1) > maxDev)
      violations.push({ contract: contract.name, id: 'TRANSFORM',
        detail: `distorting transform: scaleX=${m.transform.scaleX} scaleY=${m.transform.scaleY}  raw: ${m.transform.raw}` });
  }

  // ── Canvas backing store (bitmap.wh = cssWH × DPR) ──────────────────────────

  if (expected.canvas?.backingStore) {
    if (!canvas) {
      violations.push({ contract: contract.name, id: 'BACKING-STORE',
        detail: 'element is not a <canvas>' });
    } else {
      const expW = Math.round(rect.w * dpr);
      const expH = Math.round(rect.h * dpr);
      // Backing store uses ±1 tolerance regardless of maxTolerancePx: bitmap
      // dimensions are integers and Math.round already absorbs sub-pixel drift.
      // A tolerance > 1 here would mask genuine DPR misconfiguration.
      const BITMAP_TOL = 1;
      if (Math.abs(canvas.bitmapW - expW) > BITMAP_TOL)
        violations.push({ contract: contract.name, id: 'BACKING-STORE-W',
          detail: `bitmap.w=${canvas.bitmapW} expected cssW(${rect.w.toFixed(0)})×DPR(${dpr})=${expW}` });
      if (Math.abs(canvas.bitmapH - expH) > BITMAP_TOL)
        violations.push({ contract: contract.name, id: 'BACKING-STORE-H',
          detail: `bitmap.h=${canvas.bitmapH} expected cssH(${rect.h.toFixed(0)})×DPR(${dpr})=${expH}` });
    }
  }

  // ── Canvas painted area (Layer 2 draw audit) ─────────────────────────────────

  if (expected.canvas?.paintedArea && canvasAudits) {
    const audit = canvasAudits[contract.selector];
    if (!audit || audit.error) {
      violations.push({ contract: contract.name, id: 'PAINTED-AREA',
        detail: audit?.error ?? 'canvas audit result missing' });
    } else if (expected.canvas.paintedArea.minSpanPx !== undefined &&
               audit.paintedSpan < expected.canvas.paintedArea.minSpanPx) {
      violations.push({ contract: contract.name, id: 'PAINTED-AREA-SPAN',
        detail: `painted span ${audit.paintedSpan}px < min ${expected.canvas.paintedArea.minSpanPx}px` });
    }
  }

  // ── Screenshot pixel scan (Layer 3) ─────────────────────────────────────────
  // Always evaluate when expected.pixelScan is declared — never silently skip.

  if (expected.pixelScan) {
    if (!pixelData || !pixelData.ok) {
      // Scan infrastructure failed or was never run — explicit violation, not a silent pass.
      violations.push({ contract: contract.name, id: 'PIXEL-SCAN-FAILED',
        detail: pixelData?.error ?? 'pixel scan not run (no pixelScan contracts produced valid regions)' });
    } else {
      const r = pixelData.regions[contract.name];
      if (!r) {
        violations.push({ contract: contract.name, id: 'PIXEL-SCAN-MISSING',
          detail: `no pixel scan result for contract "${contract.name}"` });
      } else if (expected.pixelScan.minPaintedThicknessPx !== undefined &&
                 r.paintedThickness < expected.pixelScan.minPaintedThicknessPx) {
        violations.push({ contract: contract.name, id: 'PIXEL-SCAN-THICKNESS',
          detail: `painted ${r.paintedThickness}px < min ${expected.pixelScan.minPaintedThicknessPx}px` });
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public runner
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * runContracts(page, contracts, options)
 *
 * options:
 *   artifactsDir?  string   — where to write debug PNGs + violations.json on failure
 *   label?         string   — prefix for artifact file names (e.g. "chromium")
 *   screenshot?    boolean  — force screenshot on/off (default: auto when pixelScan contracts present)
 *   dpr?           number   — override DPR for pixel scan (default: read from browser)
 *   context?       any      — passed as-is to custom() validators
 *
 * Returns:
 *   { violations, measurements, canvasAudits, pixelData }
 */
export async function runContracts(page, contracts, options = {}) {
  const {
    artifactsDir = path.join(tmpdir(), 'pixel-contract-artifacts'),
    label        = 'run',
    context      = null,
  } = options;

  const needsScreenshot  = options.screenshot ??
    contracts.some(c => c.expected?.pixelScan);
  const needsCanvasAudit = contracts.some(c => c.expected?.canvas?.paintedArea);

  // ── Layer 1: BCR measurements ───────────────────────────────────────────────
  const selectors = [...new Set(contracts.filter(c => c.selector).map(c => c.selector))];
  const measurements = selectors.length > 0
    ? await page.evaluate(_measureInBrowser, selectors)
    : {};

  // ── Layer 2: canvas draw audit ──────────────────────────────────────────────
  let canvasAudits = null;
  if (needsCanvasAudit) {
    const targets = contracts
      .filter(c => c.expected?.canvas?.paintedArea)
      .map(c => ({ selector: c.selector, axis: c.expected.canvas.paintedArea.axis ?? 'h' }));
    canvasAudits = await page.evaluate(_canvasAuditInBrowser, targets);
  }

  // ── Layer 3: screenshot + pixel scan ────────────────────────────────────────
  let pixelData = null;
  if (needsScreenshot) {
    const ssBuffer = await page.screenshot({ fullPage: false });
    const ssPath   = path.join(tmpdir(), `pxc_${label}_${Date.now()}.png`);
    writeFileSync(ssPath, ssBuffer);

    const dpr = options.dpr ??
      Object.values(measurements).find(m => m?.dpr)?.dpr ?? 1;

    const regions = contracts
      .filter(c => c.expected?.pixelScan && c.selector && measurements[c.selector]?.rect)
      .map(c => ({
        name:        c.name,
        rect:        measurements[c.selector].rect,
        axis:        c.expected.pixelScan.axis ?? 'h',
        bgColor:     c.expected.pixelScan.bgColor,
        bgTolerance: c.expected.pixelScan.bgTolerance,
      }));

    if (regions.length > 0) {
      mkdirSync(artifactsDir, { recursive: true });
      const debugPng = path.join(artifactsDir, `${label}_pixel_debug.png`);
      const raw = analyzePixelRegions(ssPath, regions, debugPng);
      // Ensure .regions always exists so evaluateContract can check keys,
      // even when the Python runner failed.
      pixelData = raw.ok
        ? { ...raw, _debugPng: debugPng }
        : { ...raw, regions: {} };
    } else {
      // No regions collected — all pixelScan contracts had measurement errors.
      // Mark explicitly so evaluateContract emits PIXEL-SCAN-FAILED per contract.
      pixelData = { ok: false, regions: {}, error: 'no pixel scan regions — all selectors failed to measure' };
    }
    try { unlinkSync(ssPath); } catch {}
  }

  // ── Evaluate all contracts ───────────────────────────────────────────────────
  const violations = [];
  for (const c of contracts) {
    violations.push(...evaluateContract(c, measurements, canvasAudits, pixelData, context));
  }

  // ── Save violation JSON on failure ───────────────────────────────────────────
  if (violations.length > 0) {
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(
      path.join(artifactsDir, `${label}_violations.json`),
      JSON.stringify({ label, violations, measurements }, null, 2),
      'utf8',
    );
  }

  return { violations, measurements, canvasAudits, pixelData };
}
