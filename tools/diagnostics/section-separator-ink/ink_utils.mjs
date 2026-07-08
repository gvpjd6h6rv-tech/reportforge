// RF-CR-SECTION-SEPARATOR-1 — shared raw-pixel raster helpers for the
// section-separator diagnostic probes in this directory. Owns ONLY the
// screenshot -> canvas -> getImageData plumbing and the dark/light color
// constants; each probe file owns its own single validation responsibility.
export const DARK_TARGET = [48, 48, 48];   // #303030
export const LIGHT_TARGET = [214, 214, 214]; // #d6d6d6
export const COLOR_TOLERANCE = 12;

export function closeTo(px, target) {
  return Math.abs(px[0] - target[0]) <= COLOR_TOLERANCE
    && Math.abs(px[1] - target[1]) <= COLOR_TOLERANCE
    && Math.abs(px[2] - target[2]) <= COLOR_TOLERANCE;
}

// Single-pixel-wide column of rows, top to bottom.
export async function grabColumn(page, x, yTop, height) {
  const clip = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(yTop)), width: 4, height: Math.round(height) };
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString('base64');
  return page.evaluate(async ({ b64, w, h }) => {
    const img = new Image();
    const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    img.src = 'data:image/png;base64,' + b64;
    await loaded;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    const rows = [];
    for (let y = 0; y < h; y++) {
      const i = (y * w + 1) * 4;
      rows.push([data[i], data[i + 1], data[i + 2]]);
    }
    return rows;
  }, { b64, w: clip.width, h: clip.height });
}

// Full-width strip, each row sampled across x (every 4th px) — used to tell
// a real separator (ink spans nearly the full width) apart from a
// field/label border (ink only spans a short, localized x-range).
export async function grabStrip(page, x, yTop, width, height) {
  const clip = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(yTop)), width: Math.max(1, Math.round(width)), height: Math.round(height) };
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString('base64');
  return page.evaluate(async ({ b64, w, h }) => {
    const img = new Image();
    const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    img.src = 'data:image/png;base64,' + b64;
    await loaded;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    const rows = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x2 = 0; x2 < w; x2 += 4) {
        const i = (y * w + x2) * 4;
        row.push([data[i], data[i + 1], data[i + 2]]);
      }
      rows.push(row);
    }
    return rows;
  }, { b64, w: clip.width, h: clip.height });
}

export async function launchAtSection(chromium, baseUrl) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl);
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.sections) && DS.sections.length > 0);
  await page.waitForTimeout(500);
  return { browser, page };
}

export async function setDesignZoom(page, zoom) {
  await page.evaluate((z) => {
    if (typeof ZoomEngine !== 'undefined' && ZoomEngine.set) ZoomEngine.set(z);
    else if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(z);
  }, zoom);
  await page.waitForTimeout(350);
}

export async function getSectionRects(page) {
  return page.evaluate(() => DS.sections
    .filter(s => s.visible !== false)
    .map(s => {
      const el = document.querySelector(`.cr-section[data-section-id="${s.id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { id: s.id, bottom: r.bottom, left: r.left, width: r.width };
    })
    .filter(Boolean));
}
