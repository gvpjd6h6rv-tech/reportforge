'use strict';
/**
 * RF FLIGHT RECORDER — Preview → Insert (BASELINE, no fix injection)
 * ─────────────────────────────────────────────────────────────────────
 * DIAGNOSTIC TOOL — NOT a CI test. Run manually only.
 * See tools/diagnostics/rf-preview-insert/README.md for usage.
 *
 * Purpose:
 *   Records the UNMODIFIED behaviour of all 7 Insertar menu options when
 *   triggered from Preview mode, against a live localhost:5001 instance.
 *   No production files are modified. No fix is injected.
 *
 * What it captures per tool:
 *   · DS.elements count delta
 *   · DOM .cr-element count delta
 *   · canvas-layer class before/after
 *   · workspace class before/after
 *   · DS.previewMode state
 *   · MutationObserver log (workspace + canvas-layer class mutations)
 *   · Full event timeline (JSONL)
 *   · Screenshots: design baseline, preview active, post-insert
 *   · Flow coverage table
 *
 * Output:
 *   scratchpad/flight-recorder/baseline-<timestamp>.jsonl
 *   scratchpad/flight-recorder/<action>-<phase>.png
 */

const path       = require('path');
const fs         = require('fs');
const { chromium } = require('playwright');

const OUT_DIR    = path.resolve(__dirname, '../../../scratchpad/flight-recorder');
const TIMESTAMP  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const JSONL_PATH = path.join(OUT_DIR, `baseline-${TIMESTAMP}.jsonl`);
const TARGET     = process.env.FLIGHT_URL || 'http://localhost:5001/';
const HEADLESS   = process.env.HEADLESS === '1';

const TOOLS = [
  { action: 'insert-text',    label: 'Texto'      },
  { action: 'insert-field',   label: 'Campo'      },
  { action: 'insert-line',    label: 'Línea H'    },
  { action: 'insert-line-v',  label: 'Línea V'    },
  { action: 'insert-box',     label: 'Rectángulo' },
  { action: 'insert-barcode', label: 'Barcode'    },
  { action: 'insert-section', label: 'Sección'    },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

function writeEvent(obj) {
  fs.appendFileSync(JSONL_PATH, JSON.stringify({ _ts: Date.now(), ...obj }) + '\n');
}
async function ss(page, label) {
  const f = path.join(OUT_DIR, `${label}.png`);
  await page.screenshot({ path: f, fullPage: false });
  return f;
}

// ── Instrumentation ───────────────────────────────────────────────────────────
async function installInstrumentation(page) {
  await page.evaluate(() => {
    window.__FR_base = window.__FR_base || {};
    window.__FR_base.events = [];

    function rec(type, data) {
      window.__FR_base.events.push({ t: performance.now().toFixed(2), type, ...data });
    }

    // handleAction
    if (typeof window.handleAction === 'function' && !window.__FR_base_hA) {
      window.__FR_base_hA = window.handleAction;
      window.handleAction = function(action) {
        rec('handleAction', { action });
        return window.__FR_base_hA.call(this, action);
      };
    }

    // InsertEngine.setTool
    const IE = window.InsertEngine;
    if (IE && !window.__FR_base_sT) {
      window.__FR_base_sT = IE.setTool.bind(IE);
      IE.setTool = function(tool) {
        const ws = document.getElementById('workspace');
        const cl = document.getElementById('canvas-layer');
        rec('setTool:enter', {
          tool,
          workspaceClass:   ws ? ws.className : null,
          canvasLayerClass: cl ? cl.className : null,
          dsPreviewMode:    typeof DS !== 'undefined' ? DS.previewMode : null,
          dsCount:          typeof DS !== 'undefined' ? DS.elements.length : null,
        });
        const r = window.__FR_base_sT(tool);
        rec('setTool:exit', {
          tool,
          workspaceClass:   ws ? ws.className : null,
          canvasLayerClass: cl ? cl.className : null,
          dsPreviewMode:    typeof DS !== 'undefined' ? DS.previewMode : null,
          dsCount:          typeof DS !== 'undefined' ? DS.elements.length : null,
          domCount:         document.querySelectorAll('.cr-element:not(#preview-content .cr-element)').length,
        });
        return r;
      };
    }

    // PreviewEngineMode.hide
    const PEM = window.PreviewEngineMode;
    if (PEM && !window.__FR_base_pH) {
      window.__FR_base_pH = PEM.hide.bind(PEM);
      PEM.hide = function() {
        const cl = document.getElementById('canvas-layer');
        rec('PreviewHide:enter', {
          canvasLayerClass: cl ? cl.className : null,
          dsPreviewMode:    typeof DS !== 'undefined' ? DS.previewMode : null,
        });
        const r = window.__FR_base_pH();
        rec('PreviewHide:exit', {
          canvasLayerClass: cl ? cl.className : null,
          dsPreviewMode:    typeof DS !== 'undefined' ? DS.previewMode : null,
        });
        return r;
      };
    }

    // DS.setElements
    if (typeof DS !== 'undefined' && typeof DS.setElements === 'function' && !window.__FR_base_sE) {
      window.__FR_base_sE = DS.setElements;
      DS.setElements = function(elements, source) {
        rec('DS.setElements', { source, before: DS.elements.length, after: elements.length });
        return window.__FR_base_sE.call(this, elements, source);
      };
    }

    // MutationObserver — workspace class
    if (!window.__FR_base_wsObs) {
      const ws = document.getElementById('workspace');
      if (ws) {
        window.__FR_base_wsObs = new MutationObserver(ms => {
          ms.forEach(m => {
            if (m.attributeName === 'class')
              rec('workspace:class', { from: m.oldValue, to: ws.className });
          });
        });
        window.__FR_base_wsObs.observe(ws, { attributes: true, attributeOldValue: true });
      }
    }

    // MutationObserver — canvas-layer class
    if (!window.__FR_base_clObs) {
      const cl = document.getElementById('canvas-layer');
      if (cl) {
        window.__FR_base_clObs = new MutationObserver(ms => {
          ms.forEach(m => {
            if (m.attributeName === 'class')
              rec('canvasLayer:class', { from: m.oldValue, to: cl.className });
          });
        });
        window.__FR_base_clObs.observe(cl, { attributes: true, attributeOldValue: true });
      }
    }
  });
}

async function resetEvents(page) {
  await page.evaluate(() => { if (window.__FR_base) window.__FR_base.events = []; });
}

// ── State probe ───────────────────────────────────────────────────────────────
async function probeState(page, label) {
  return page.evaluate((lbl) => {
    const cl  = document.getElementById('canvas-layer');
    const pl  = document.getElementById('preview-layer');
    const ws  = document.getElementById('workspace');
    const dsEls  = typeof DS !== 'undefined' ? DS.elements : [];
    const domEls = document.querySelectorAll('.cr-element:not(#preview-content .cr-element)');
    const last   = dsEls.length ? dsEls[dsEls.length - 1] : null;

    let lastInSection = false, lastInPreview = false, lastRect = null;
    if (last) {
      const div = document.querySelector(`.cr-element[data-id="${last.id}"]`);
      if (div) {
        lastInSection = !!div.closest('.cr-section');
        lastInPreview = !!div.closest('#preview-content');
        const r = div.getBoundingClientRect();
        lastRect = { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      }
    }

    return {
      label:            lbl,
      dsPreviewMode:    typeof DS !== 'undefined' ? DS.previewMode : null,
      dsTool:           typeof DS !== 'undefined' ? DS.tool : null,
      dsCount:          dsEls.length,
      domCount:         domEls.length,
      canvasLayerClass: cl ? cl.className : null,
      workspaceClass:   ws ? ws.className : null,
      plDisplay:        pl ? getComputedStyle(pl).display : null,
      sectionDivCount:  document.querySelectorAll('.cr-section').length,
      lastEl:           last ? { id: last.id, type: last.type, sectionId: last.sectionId } : null,
      lastInSection,
      lastInPreview,
      lastRect,
      eventLog:         window.__FR_base ? window.__FR_base.events : [],
    };
  }, label);
}

async function ensureDesign(page) {
  const inPrev = await page.evaluate(() => typeof DS !== 'undefined' && DS.previewMode);
  if (inPrev) { await page.locator('#tab-design').click(); await page.waitForTimeout(400); }
}
async function undo(page, before) {
  const n = await page.evaluate(() => typeof DS !== 'undefined' ? DS.elements.length : 0);
  if (n > before) { await page.keyboard.press('Control+z'); await page.waitForTimeout(300); }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n' + '═'.repeat(72));
  console.log('RF FLIGHT RECORDER — Preview → Insert (BASELINE)');
  console.log(`Target:  ${TARGET}`);
  console.log(`Headed:  ${!HEADLESS}`);
  console.log(`JSONL:   ${JSONL_PATH}`);
  console.log('═'.repeat(72) + '\n');

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    slowMo: 60,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(`PAGEERROR: ${e.message}`));

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
    await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
  } catch {
    console.error('Page not ready — is localhost:5001 running?');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(800);

  const initialDsCount = await page.evaluate(() => DS.elements.length);
  console.log(`Page ready. DS.elements: ${initialDsCount}\n`);
  writeEvent({ phase: 'init', dsCount: initialDsCount, url: TARGET });
  await ss(page, 'baseline-00-initial');

  await installInstrumentation(page);

  const results = [];

  for (const tool of TOOLS) {
    const tag = tool.action;
    console.log('─'.repeat(72));
    console.log(`TOOL: ${tool.label} (${tag})`);

    await ensureDesign(page);
    await page.keyboard.press('Escape');
    await resetEvents(page);

    const dsBefore  = await page.evaluate(() => DS.elements.length);
    const domBefore = await page.evaluate(() =>
      document.querySelectorAll('.cr-element:not(#preview-content .cr-element)').length);

    writeEvent({ phase: 'tool:start', action: tag, label: tool.label, dsBefore, domBefore });

    // Design baseline
    const s0 = await probeState(page, 'design-before');
    await ss(page, `${tag}-01-design`);
    writeEvent({ phase: 'design-baseline', action: tag, ...s0 });

    // Enter Preview
    await page.locator('#tab-preview').click();
    await page.waitForTimeout(1500);

    const s1 = await probeState(page, 'preview-active');
    await ss(page, `${tag}-02-preview`);
    writeEvent({ phase: 'preview-active', action: tag, ...s1 });
    console.log(`  Preview active: canvas="${s1.canvasLayerClass}"  sections=${s1.sectionDivCount}`);

    // Trigger insert via menu
    await page.locator('.menu-item[data-menu="insertar"]').click();
    await page.waitForSelector('#dd-insertar', { state: 'visible', timeout: 3000 });
    await page.locator(`#dd-insertar .dd-item[data-action="${tag}"]`).click();
    await page.waitForTimeout(600);

    const s2 = await probeState(page, 'post-insert');
    await ss(page, `${tag}-03-post-insert`);
    writeEvent({ phase: 'post-insert', action: tag, dsBefore, domBefore, ...s2 });

    const dsAfter  = s2.dsCount;
    const domAfter = s2.domCount;

    console.log(`  post-insert: ds=${dsBefore}→${dsAfter}  dom=${domBefore}→${domAfter}`);
    console.log(`  canvas="${s2.canvasLayerClass}"  workspace="${s2.workspaceClass}"`);
    console.log(`  lastEl=${JSON.stringify(s2.lastEl)}  inSection=${s2.lastInSection}  inPreview=${s2.lastInPreview}`);

    if (s2.workspaceClass && !s2.workspaceClass.includes('workspace')) {
      console.log(`  ⚠ C9: workspace class DESTROYED — "${s2.workspaceClass}"`);
    }

    results.push({
      label:          tool.label,
      action:         tag,
      dsPlus1:        dsAfter > dsBefore,
      domPlus1:       domAfter > domBefore,
      previewHide:    s2.eventLog.some(e => e.type === 'PreviewHide:enter'),
      setTool:        s2.eventLog.some(e => e.type === 'setTool:enter'),
      setElements:    s2.eventLog.some(e => e.type === 'DS.setElements'),
      inSection:      s2.lastInSection,
      wsClassOK:      s2.workspaceClass ? s2.workspaceClass.includes('workspace') : null,
      overlayGone:    !s2.canvasLayerClass?.includes('preview-mode'),
    });

    writeEvent({ phase: 'tool:result', action: tag, result: results[results.length - 1] });

    // Reset
    await page.keyboard.press('Escape');
    await ensureDesign(page);
    await undo(page, dsBefore);
    await page.waitForTimeout(300);
  }

  // ── Coverage table ──────────────────────────────────────────────────────────
  const B = v => v === true ? '✔' : v === false ? '✘' : '?';
  const W = (s, n) => String(s ?? '?').padEnd(n);

  console.log('\n\n' + '═'.repeat(110));
  console.log('FLOW COVERAGE TABLE — BASELINE (no fix injected)');
  console.log('═'.repeat(110));
  console.log([
    W('Opción', 12), W('setTool', 9), W('hide', 7), W('setElements', 12),
    W('DS+1', 6), W('DOM+1', 6), W('inSection', 10), W('wsOK', 6), W('overlay', 8),
  ].join('|'));
  console.log('─'.repeat(110));
  for (const r of results) {
    console.log([
      W(r.label, 12), W(B(r.setTool), 9), W(B(r.previewHide), 7),
      W(B(r.setElements), 12), W(B(r.dsPlus1), 6), W(B(r.domPlus1), 6),
      W(B(r.inSection), 10), W(B(r.wsClassOK), 6), W(B(r.overlayGone), 8),
    ].join('|'));
  }
  console.log('═'.repeat(110));

  console.log('\nFIRST DEVIATION PER OPTION:');
  const STEPS = [
    { k: 'setTool',    l: 'InsertEngine.setTool'   },
    { k: 'previewHide',l: 'PreviewEngineMode.hide'  },
    { k: 'setElements',l: 'DS.setElements'          },
    { k: 'dsPlus1',   l: 'DS.elements +1'          },
    { k: 'domPlus1',  l: 'DOM .cr-element +1'      },
    { k: 'inSection', l: 'element inside .cr-section'},
    { k: 'wsClassOK', l: 'workspace class preserved'},
    { k: 'overlayGone',l:'preview overlay removed'  },
  ];
  for (const r of results) {
    const first = STEPS.find(s => !r[s.k]);
    console.log(`  ${W(r.label, 12)} → ${first ? `BREAKS AT: ${first.l}` : 'FULL FLOW ✔'}`);
  }

  if (consoleErrors.length) {
    console.log(`\nCONSOLE ERRORS (${consoleErrors.length}):`);
    consoleErrors.slice(0, 20).forEach(e => console.log('  ' + e));
  } else {
    console.log('\nConsole errors: none ✔');
  }

  console.log(`\nJSONL:       ${JSONL_PATH}`);
  console.log(`Screenshots: ${OUT_DIR}/`);

  await browser.close();
})();
