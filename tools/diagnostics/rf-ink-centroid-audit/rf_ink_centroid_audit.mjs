#!/usr/bin/env node
'use strict';

/**
 * RF Ink Centroid Audit
 *
 * Diagnostic-only visual gate for ReportForge.
 * Measures the visible ink centroid of glyph/text pixels from real screenshots.
 *
 * Why:
 * - Range.getBoundingClientRect() can measure the full line box, not visible ink.
 * - bbox-center can lie under clipping because opposite clipped edges keep bbox stable.
 * - ink centroid tracks the visual weight the user actually sees.
 *
 * Output goes to OUTPUT_DIR, default /tmp/rf-ink-centroid-audit.
 */

import { chromium } from 'playwright';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = process.env;

const FLIGHT_URL =
  env.FLIGHT_URL ||
  'http://127.0.0.1:5001/designer/crystal-reports-designer-v4.html';

const LAYOUT_PATH = env.LAYOUT_PATH || '';
const FIELD_IDS = csv(env.FIELD_IDS || 'rf-vv1');
const ZOOMS = parseZooms(env.ZOOMS || '1,2,4');
const VIEWS = csv(env.VIEWS || 'design'); // design,preview,both via "design,preview"
const OUTPUT_DIR = env.OUTPUT_DIR || '/tmp/rf-ink-centroid-audit';

const HEADLESS = env.HEADLESS !== '0';
const APPLY_MODE = env.APPLY_MODE || 'ui-first'; // ui-first | direct
const INK_TEXT = env.INK_TEXT ?? '0';
const FORCE_INK_TEXT = env.FORCE_INK_TEXT || 'auto'; // auto | 1 | 0
const VIEWPORT_W = Number(env.VIEWPORT_W || 1500);
const VIEWPORT_H = Number(env.VIEWPORT_H || 950);
const DEVICE_SCALE_FACTOR = Number(env.DSF || 1);
const WAIT_MS = Number(env.WAIT_MS || 180);
const DEBUG = env.DEBUG === '1';

function csv(s) {
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((x) => (x === 'both' ? ['design', 'preview'] : [x]));
}

function parseZooms(s) {
  return csv(s).map((raw) => {
    const n = Number(String(raw).replace('%', ''));
    if (!Number.isFinite(n) || n <= 0) throw new Error(`ZOOMS inválido: ${raw}`);
    return n > 10 ? n / 100 : n;
  });
}

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function log(...args) {
  console.log(...args);
}

function debug(...args) {
  if (DEBUG) console.error('[debug]', ...args);
}

async function wait(page, ms = WAIT_MS) {
  await page.waitForTimeout(ms);
}

async function main() {
  ensureDir(OUTPUT_DIR);

  const rawResultsPath = path.join(OUTPUT_DIR, 'raw_results.json');
  const analyzer = path.join(__dirname, 'ink_centroid_analyze.py');

  rmIfExists(rawResultsPath);

  log('🔍 RF Ink Centroid Audit');
  log(`URL:        ${FLIGHT_URL}`);
  log(`LAYOUT:     ${LAYOUT_PATH || '(usar layout ya cargado si aplica)'}`);
  log(`FIELDS:     ${FIELD_IDS.join(', ')}`);
  log(`ZOOMS:      ${ZOOMS.map((z) => `${Math.round(z * 100)}%`).join(', ')}`);
  log(`VIEWS:      ${VIEWS.join(', ')}`);
  log(`OUTPUT_DIR: ${OUTPUT_DIR}`);
  log('');

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  page.on('console', (msg) => {
    if (DEBUG) console.error(`[browser:${msg.type()}] ${msg.text()}`);
  });

  await page.goto(FLIGHT_URL, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => window.DS && document.querySelector('#tab-design'),
    null,
    { timeout: 20000 }
  );

  await installBrowserHelpers(page);

  if (LAYOUT_PATH) {
    if (!existsSync(LAYOUT_PATH)) {
      throw new Error(`LAYOUT_PATH no existe: ${LAYOUT_PATH}`);
    }

    const rawLayout = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));

    await page.waitForFunction(
      () => window.CommandRuntimeFile && typeof window.CommandRuntimeFile._normalizeLayout === 'function',
      null,
      { timeout: 20000 }
    );

    await page.evaluate((raw) => {
      const normalized = window.CommandRuntimeFile._normalizeLayout(raw);
      window.CommandRuntimeFile._applyLoadedLayout(
        normalized,
        null,
        null,
        'rf-ink-centroid-audit'
      );
    }, rawLayout);

    await wait(page, 400);
  }

  const measurements = [];

  for (const view of VIEWS) {
    await setView(page, view);

    for (const zoom of ZOOMS) {
      await setZoom(page, zoom);
      await wait(page, 300);

      for (const fieldId of FIELD_IDS) {
        const exists = await ensureNodeVisible(page, fieldId, view);

        if (!exists) {
          measurements.push({
            fieldId,
            view,
            zoom,
            state: null,
            status: 'NO_NODE',
            error: `No se encontró nodo visible para ${fieldId} en ${view}`,
          });
          continue;
        }

        for (const state of ['top', 'middle', 'bottom']) {
          const interactionMode = await applyValign(page, fieldId, state, view);
          await wait(page, 220);

          await ensureNodeVisible(page, fieldId, view);
          await maybeInjectInkText(page, fieldId, view);

          const meta = await measureNode(page, fieldId, view);
          const shotPath = path.join(
            OUTPUT_DIR,
            `${safeName(fieldId)}_${view}_${Math.round(zoom * 100)}_${state}.png`
          );

          await page.screenshot({ path: shotPath, fullPage: false });

          measurements.push({
            fieldId,
            view,
            zoom,
            zoomLabel: `${Math.round(zoom * 100)}%`,
            state,
            interactionMode,
            screenshot: shotPath,
            deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio || 1),
            meta,
          });
        }
      }
    }
  }

  await browser.close();

  const raw = {
    generatedAt: new Date().toISOString(),
    config: {
      FLIGHT_URL,
      LAYOUT_PATH,
      FIELD_IDS,
      ZOOMS,
      VIEWS,
      OUTPUT_DIR,
      HEADLESS,
      APPLY_MODE,
      INK_TEXT,
      FORCE_INK_TEXT,
      VIEWPORT_W,
      VIEWPORT_H,
      DEVICE_SCALE_FACTOR,
    },
    measurements,
  };

  writeFileSync(rawResultsPath, JSON.stringify(raw, null, 2));

  log('');
  log('🧪 Analizando tinta visible con Python/Pillow...');
  const py = spawnSync('python3', [analyzer, rawResultsPath, OUTPUT_DIR], {
    stdio: 'inherit',
    env: process.env,
  });

  if (py.status !== 0) {
    console.error('');
    console.error('❌ Falló el analizador Python.');
    console.error('   Verifica que Pillow esté instalado: python3 -m pip install pillow');
    process.exit(py.status || 1);
  }

  log('');
  log(`✅ Listo: ${path.join(OUTPUT_DIR, 'results.json')}`);
  log(`🖼️  Crops: ${OUTPUT_DIR}`);
}

function rmIfExists(p) {
  try {
    if (existsSync(p)) rmSync(p, { force: true });
  } catch {}
}

async function setView(page, view) {
  if (view === 'preview') {
    await page.click('#tab-preview').catch(() => {});
  } else {
    await page.click('#tab-design').catch(() => {});
  }
  await wait(page, 260);
}

async function setZoom(page, zoom) {
  const label = `${Math.round(zoom * 100)}%`;

  const ok = await page.evaluate((label) => {
    const sel = document.querySelector('#tb-zoom');
    if (!sel) return false;

    const opt = [...sel.options].find((o) => o.textContent.trim() === label);
    if (!opt) return false;

    sel.value = opt.value;
    opt.selected = true;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, label);

  if (!ok) {
    debug(`No pude cambiar zoom por UI a ${label}; sigo con zoom actual.`);
  }
}

async function ensureNodeVisible(page, fieldId, view) {
  return await page.evaluate(
    ({ fieldId, view }) => {
      const node = queryRfNode(fieldId, view);
      if (!node) return false;
      node.scrollIntoView({ block: 'center', inline: 'center' });
      return true;

      function esc(id) {
        return window.CSS?.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
      }

      function queryRfNode(id, v) {
        const sid = esc(id);
        const designSelectors = [
          `.cr-element[data-id="${sid}"]`,
          `[data-id="${sid}"].cr-element`,
        ];

        const previewSelectors = [
          `.pv-el[data-id="${sid}"]`,
          `.pv-element[data-id="${sid}"]`,
          `[data-preview-id="${sid}"]`,
          `[data-element-id="${sid}"]`,
          `[data-id="${sid}"].pv-el`,
          `[data-id="${sid}"]`,
        ];

        const selectors = v === 'preview'
          ? previewSelectors.concat(designSelectors)
          : designSelectors.concat(previewSelectors);

        for (const sel of selectors) {
          const n = document.querySelector(sel);
          if (n) return n;
        }
        return null;
      }
    },
    { fieldId, view }
  );
}

async function applyValign(page, fieldId, state, view) {
  const value = state === 'center' ? 'middle' : state;

  // Preview normalmente no tiene toolbar real para formatear.
  // Para auditar Preview cambiamos el modelo y re-renderizamos Preview.
  if (view === 'preview') {
    const mode = await page.evaluate(
      ({ fieldId, value }) => window.__rfInkDirectSetValign(fieldId, value),
      { fieldId, value }
    );
    await page.click('#tab-preview').catch(() => {});
    await wait(page, 260);
    return `${mode}+preview-render`;
  }

  await selectElement(page, fieldId);

  if (APPLY_MODE !== 'direct') {
    const uiResult = await page.evaluate(async ({ value }) => {
      const action = `text-valign-${value}`;

      const dd =
        document.querySelector('#tdd-btn-texto-v') ||
        document.querySelector('[data-dd="texto-v"]');

      if (dd) {
        dd.click();
        await new Promise((r) => setTimeout(r, 80));
      }

      const candidates = [
        ...document.querySelectorAll('[data-action],button,div,li,a'),
      ];

      const btn = candidates.find((n) => n.getAttribute('data-action') === action);

      if (btn) {
        btn.click();
        return { ok: true, mode: 'real-ui-click', action };
      }

      return { ok: false, mode: 'ui-not-found', action };
    }, { value });

    if (uiResult?.ok) return uiResult.mode;
  }

  const direct = await page.evaluate(
    ({ fieldId, value }) => directSetValign(fieldId, value),
    { fieldId, value }
  );

  return direct;
}

async function selectElement(page, fieldId) {
  await page.evaluate((fieldId) => {
    const el = findModelElement(fieldId);

    if (window.DS?.selection?.clear) {
      DS.selection.clear();
      DS.selection.add(fieldId);
    }

    document.querySelectorAll('.cr-element.selected').forEach((n) => {
      n.classList.remove('selected');
    });

    const node = queryDesignNode(fieldId);
    if (node) node.classList.add('selected');

    window.FormatEngine?.updateToolbar?.();
    window.SelectionOverlayRender?.render?.();

    return !!el;

    function findModelElement(id) {
      if (!window.DS) return null;
      if (Array.isArray(DS.elements)) return DS.elements.find((e) => e.id === id);
      if (DS.elements?.get) return DS.elements.get(id);

      for (const sec of DS.sections || []) {
        for (const e of sec.elements || []) {
          if (e.id === id) return e;
        }
      }
      return null;
    }

    function queryDesignNode(id) {
      const sid = window.CSS?.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
      return document.querySelector(`.cr-element[data-id="${sid}"]`);
    }
  }, fieldId);
}

async function maybeInjectInkText(page, fieldId, view) {
  await page.evaluate(
    ({ fieldId, view, inkText, forceMode }) => {
      const node = queryRfNode(fieldId, view);
      if (!node) return false;

      const span =
        node.querySelector('.el-content') ||
        node.querySelector('.pv-content') ||
        node.querySelector('[data-role="content"]') ||
        node;

      const el = findModelElement(fieldId);
      const current = (span.textContent || '').trim();

      const force = forceMode === '1';
      const never = forceMode === '0';
      const auto = forceMode === 'auto';

      const shouldInject =
        inkText &&
        !never &&
        (force || !current || (auto && el && el.type === 'field'));

      if (shouldInject) span.textContent = inkText;
      return true;

      function esc(id) {
        return window.CSS?.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
      }

      function queryRfNode(id, v) {
        const sid = esc(id);
        const designSelectors = [`.cr-element[data-id="${sid}"]`];
        const previewSelectors = [
          `.pv-el[data-id="${sid}"]`,
          `.pv-element[data-id="${sid}"]`,
          `[data-preview-id="${sid}"]`,
          `[data-element-id="${sid}"]`,
          `[data-id="${sid}"]`,
        ];

        const selectors = v === 'preview'
          ? previewSelectors.concat(designSelectors)
          : designSelectors.concat(previewSelectors);

        for (const sel of selectors) {
          const n = document.querySelector(sel);
          if (n) return n;
        }
        return null;
      }

      function findModelElement(id) {
        if (!window.DS) return null;
        if (Array.isArray(DS.elements)) return DS.elements.find((e) => e.id === id);
        if (DS.elements?.get) return DS.elements.get(id);
        for (const sec of DS.sections || []) {
          for (const e of sec.elements || []) {
            if (e.id === id) return e;
          }
        }
        return null;
      }
    },
    { fieldId, view, inkText: INK_TEXT, forceMode: FORCE_INK_TEXT }
  );
}

async function installBrowserHelpers(page) {
  await page.evaluate(() => {
    window.__rfInkDirectSetValign = function directSetValign(fieldId, value) {
      const map = {
        top: 'flex-start',
        middle: 'center',
        center: 'center',
        bottom: 'flex-end',
      };

      const flex = map[value] || 'center';

      function esc(id) {
        return window.CSS?.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
      }

      function findModelElement(id) {
        if (!window.DS) return null;

        if (Array.isArray(DS.elements)) {
          return DS.elements.find((e) => e.id === id) || null;
        }

        if (DS.elements?.get) {
          return DS.elements.get(id) || null;
        }

        for (const sec of DS.sections || []) {
          for (const e of sec.elements || []) {
            if (e.id === id) return e;
          }
        }

        return null;
      }

      const el = findModelElement(fieldId);
      if (el) el.valign = value === 'center' ? 'middle' : value;

      const sid = esc(fieldId);

      const nodes = [
        document.querySelector(`.cr-element[data-id="${sid}"]`),
        document.querySelector(`.pv-el[data-id="${sid}"]`),
        document.querySelector(`.pv-element[data-id="${sid}"]`),
        document.querySelector(`[data-preview-id="${sid}"]`),
        document.querySelector(`[data-element-id="${sid}"]`),
        document.querySelector(`[data-id="${sid}"]`),
      ].filter(Boolean);

      for (const node of nodes) {
        node.style.alignItems = flex;
        node.style.display = node.style.display || 'flex';
      }

      try {
        window._canonicalCanvasWriter?.().updateElement?.(fieldId);
      } catch {}

      try {
        window.CanvasLayoutElements?.updateElement?.(fieldId);
      } catch {}

      try {
        window.FormatEngine?.updateToolbar?.();
      } catch {}

      try {
        window.PropertiesEngine?.render?.();
      } catch {}

      return 'direct-format-fallback';
    };
  });
}


async function measureNode(page, fieldId, view) {
  return await page.evaluate(
    ({ fieldId, view }) => {
      const node = queryRfNode(fieldId, view);
      const span =
        node?.querySelector('.el-content') ||
        node?.querySelector('.pv-content') ||
        node?.querySelector('[data-role="content"]') ||
        node;

      const el = findModelElement(fieldId);

      if (!node || !span) {
        return {
          status: 'NO_NODE',
          fieldId,
          view,
        };
      }

      const nr = rectObj(node.getBoundingClientRect());
      const sr = rectObj(span.getBoundingClientRect());
      const ncs = getComputedStyle(node);
      const scs = getComputedStyle(span);

      return {
        status: 'OK',
        fieldId,
        view,
        model: el
          ? {
              id: el.id,
              type: el.type,
              text: el.text || el.content || '',
              fieldPath: el.fieldPath || '',
              x: el.x,
              y: el.y,
              w: el.w,
              h: el.h,
              fontSize: el.fontSize,
              align: el.align,
              valign: el.valign,
            }
          : null,
        fieldRect: nr,
        contentRect: sr,
        visibleText: (span.textContent || '').trim().slice(0, 120),
        styles: {
          nodeDisplay: ncs.display,
          nodeAlignItems: ncs.alignItems,
          nodeJustifyContent: ncs.justifyContent,
          nodeOverflow: ncs.overflow,
          nodeHeight: ncs.height,
          nodeWidth: ncs.width,
          nodeBoxSizing: ncs.boxSizing,
          contentDisplay: scs.display,
          contentHeight: scs.height,
          contentWidth: scs.width,
          contentLineHeight: scs.lineHeight,
          contentFontSize: scs.fontSize,
          contentFontFamily: scs.fontFamily,
          contentTextAlign: scs.textAlign,
          contentOverflow: scs.overflow,
          contentWhiteSpace: scs.whiteSpace,
          contentFlex: scs.flex,
          contentAlignSelf: scs.alignSelf,
        },
      };

      function rectObj(r) {
        return {
          left: +r.left.toFixed(3),
          top: +r.top.toFixed(3),
          right: +r.right.toFixed(3),
          bottom: +r.bottom.toFixed(3),
          width: +r.width.toFixed(3),
          height: +r.height.toFixed(3),
          centerX: +((r.left + r.right) / 2).toFixed(3),
          centerY: +((r.top + r.bottom) / 2).toFixed(3),
        };
      }

      function esc(id) {
        return window.CSS?.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
      }

      function queryRfNode(id, v) {
        const sid = esc(id);
        const designSelectors = [`.cr-element[data-id="${sid}"]`];
        const previewSelectors = [
          `.pv-el[data-id="${sid}"]`,
          `.pv-element[data-id="${sid}"]`,
          `[data-preview-id="${sid}"]`,
          `[data-element-id="${sid}"]`,
          `[data-id="${sid}"]`,
        ];

        const selectors = v === 'preview'
          ? previewSelectors.concat(designSelectors)
          : designSelectors.concat(previewSelectors);

        for (const sel of selectors) {
          const n = document.querySelector(sel);
          if (n) return n;
        }
        return null;
      }

      function findModelElement(id) {
        if (!window.DS) return null;
        if (Array.isArray(DS.elements)) return DS.elements.find((e) => e.id === id);
        if (DS.elements?.get) return DS.elements.get(id);
        for (const sec of DS.sections || []) {
          for (const e of sec.elements || []) {
            if (e.id === id) return e;
          }
        }
        return null;
      }
    },
    { fieldId, view }
  );
}

main().catch((err) => {
  console.error('');
  console.error('❌ rf_ink_centroid_audit failed');
  console.error(err?.stack || err);
  process.exit(1);
});
