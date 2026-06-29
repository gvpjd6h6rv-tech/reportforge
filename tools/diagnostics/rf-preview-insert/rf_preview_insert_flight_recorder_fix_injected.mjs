'use strict';
/**
 * RF FLIGHT RECORDER — Preview → Insert (FIX INJECTED)
 * ─────────────────────────────────────────────────────────────────────
 * DIAGNOSTIC TOOL — NOT a CI test. Run manually only.
 * See tools/diagnostics/rf-preview-insert/README.md for usage.
 *
 * Purpose:
 *   Injects insertAtDefaultPosition + preview-branch into InsertEngine
 *   via page.evaluate ONLY (no production files modified). Reproduces
 *   and verifies the fix for the Preview→Insert section-clipping bug.
 *
 * What it captures per tool (extended vs baseline recorder):
 *   · All baseline coverage (setTool, hide, setElements, DS+1, DOM+1)
 *   · renderElement / renderAll / renderHandles
 *   · elementFromPoint at element center (tag, class, blocker details)
 *   · section.getBoundingClientRect().height vs element offsetTop+height
 *   · contain:paint clipping verdict
 *   · workspace scroll position
 *   · 3-click survival test per element
 *   · Full event timeline (JSONL) + screenshots
 *
 * Root cause this tool was built to demonstrate:
 *   The det section had height=14px. insertAtDefaultPosition placed
 *   elements at relY=4 with h≥16. bottom(20) > sectionH(14) → the
 *   element was clipped by CSS contain:paint on .cr-section and thus
 *   returned NOT by elementFromPoint. DS+1 and DOM+1 both passed,
 *   making this invisible to automated tests (fake-green, 20+ iters).
 *
 * Output:
 *   scratchpad/flight-recorder/fix-injected-<timestamp>.jsonl
 *   scratchpad/flight-recorder/<action>-<phase>.png
 */

import path   from 'node:path';
import fs     from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR    = path.resolve(__dirname, '../../../scratchpad/flight-recorder');
const TIMESTAMP  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const JSONL_PATH = path.join(OUT_DIR, `fix-injected-${TIMESTAMP}.jsonl`);
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

// ── Fix injection (no production file writes) ─────────────────────────────────
async function injectFix(page) {
  await page.evaluate(() => {
    if (window.__FR_fix_injected) return;
    window.__FR_fix_injected = true;

    const IE = window.InsertEngine;
    if (!IE) { console.error('[INJECT] InsertEngine not found'); return; }

    IE.insertAtDefaultPosition = function(tool) {
      const W = { text: 200, field: 200, line: 200, 'line-v': 2, box: 200, barcode: 200 };
      const H = { text: 16,  field: 16,  line: 2,   'line-v': 60, box: 40, barcode: 60 };
      const w = W[tool] || 120, h = H[tool] || 20;
      const relY = DS.snap(4);
      const needed = DS.snap(relY + h + 4);

      // Prefer det section with sufficient height; else grow the tallest section
      let sec = DS.sections.find(s => s.stype === 'det' && s.height >= needed);
      if (!sec) sec = DS.sections.reduce((b, s) => (!b || s.height > b.height) ? s : b, null);
      if (!sec) { console.warn('[insertAtDefault] no section'); return; }

      if (sec.height < needed) {
        sec.height = needed;
        const secDiv = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
        if (secDiv) secDiv.style.height = sec.height + 'px';
        if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();
        if (typeof SectionEngine !== 'undefined') SectionEngine.updateSectionsList();
      }

      const pageW = (typeof CFG !== 'undefined' && CFG.PAGE_W) || 754;
      const x = DS.snap(Math.max(0, Math.round((pageW - w) / 2)));

      let newEl;
      if (tool === 'text')    newEl = mkEl('text',    sec.id, x, relY, w, h, { content: 'Texto', bgColor: 'transparent', borderColor: 'transparent' });
      else if (tool === 'field')   newEl = mkEl('field',   sec.id, x, relY, w, h, { fieldPath: '', content: 'Seleccione campo' });
      else if (tool === 'line')    newEl = mkEl('line',    sec.id, x, relY, w, Math.max(h, 2), { borderColor: '#000', lineWidth: 1 });
      else if (tool === 'line-v')  newEl = mkEl('line',    sec.id, x, relY, 2, Math.max(h, 20), { borderColor: '#000', lineWidth: 1, lineDir: 'v' });
      else if (tool === 'box')     newEl = mkEl('rect',    sec.id, x, relY, w, h, { bgColor: 'transparent', borderColor: '#000', borderWidth: 1 });
      else if (tool === 'barcode') newEl = mkEl('barcode', sec.id, x, relY, w, h, { barcodeType: 'code128', showText: true });
      if (!newEl) return;

      DS.setElements([...DS.elements, newEl], 'InsertEngine.insertAtDefaultPosition');
      _canonicalCanvasWriter().renderElement(newEl);
      DS.selectOnly(newEl.id, 'InsertEngine.insertAtDefaultPosition');
      SelectionEngine.renderHandles();
      PropertiesEngine.render();
      FormatEngine.updateToolbar();
      DS.saveHistory();
      this.setTool('pointer');

      const _elId = newEl.id;
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.post(() => {
          const div = document.querySelector(`.cr-element[data-id="${_elId}"]`);
          if (div) div.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        }, 'insert-scroll-to-' + _elId);
      }
      if (tool === 'text') {
        const div = document.querySelector(`.cr-element[data-id="${newEl.id}"]`);
        if (div) setTimeout(() => SelectionEngine.startTextEdit(div, newEl), 50);
      }
      if (tool === 'field') {
        const sb = document.getElementById('sb-msg');
        if (sb) sb.textContent = 'Arrastre un campo desde el Explorador para asignarlo';
      }
    };

    const _TOOL_CLASSES = [
      'tool-pointer', 'tool-text', 'tool-field',
      'tool-line', 'tool-line-v', 'tool-box', 'tool-barcode', 'tool-section',
    ];
    const _origSetTool = IE.setTool.bind(IE);
    IE.setTool = function(tool) {
      if (tool !== 'pointer' && DS.previewMode && typeof PreviewEngineMode !== 'undefined') {
        PreviewEngineMode.hide();
        if (tool !== 'section') this.insertAtDefaultPosition(tool);
        return;
      }
      DS.setTool(tool, 'InsertEngine.setTool');
      document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      const cs = document.getElementById('workspace');
      cs.classList.remove(..._TOOL_CLASSES);
      if (tool !== 'pointer') cs.classList.add(`tool-${tool}`);
      if (tool === 'pointer') SelectionEngine._drag = null;
    };

    console.log('[INJECT] insertAtDefaultPosition + preview-branch injected');
  });
}

// ── Instrumentation ───────────────────────────────────────────────────────────
async function installInstrumentation(page) {
  await page.evaluate(() => {
    window.__FR = window.__FR || {};
    window.__FR.events = [];
    window.__FR.coverage = {
      handleAction: false, setTool: false, insertAtDefaultPosition: false,
      previewHide: false, setElements: false, renderElement: false,
      renderAll: false, renderHandles: false,
    };

    function rec(type, data) {
      window.__FR.events.push({ t: performance.now().toFixed(2), type, ...data });
    }

    const IE  = window.InsertEngine;
    const CLE = window.CanvasLayoutElements;
    const PEM = window.PreviewEngineMode;
    const SE  = window.SelectionEngine;

    if (typeof window.handleAction === 'function' && !window.__FR_hA_orig) {
      window.__FR_hA_orig = window.handleAction;
      window.handleAction = function(action) {
        window.__FR.coverage.handleAction = true;
        rec('handleAction', { action });
        return window.__FR_hA_orig.call(this, action);
      };
    }
    if (IE && !window.__FR_sT_orig) {
      window.__FR_sT_orig = IE.setTool.bind(IE);
      IE.setTool = function(tool) {
        const ws = document.getElementById('workspace');
        const cl = document.getElementById('canvas-layer');
        window.__FR.coverage.setTool = true;
        rec('setTool:enter', {
          tool,
          workspaceClass: ws ? ws.className : null, canvasLayerClass: cl ? cl.className : null,
          dsPreviewMode: DS?.previewMode, dsCount: DS?.elements.length,
        });
        const r = window.__FR_sT_orig(tool);
        rec('setTool:exit', {
          tool,
          workspaceClass: ws ? ws.className : null, canvasLayerClass: cl ? cl.className : null,
          dsPreviewMode: DS?.previewMode, dsCount: DS?.elements.length,
          domCount: document.querySelectorAll('.cr-element:not(#preview-content .cr-element)').length,
        });
        return r;
      };
    }
    if (IE && IE.insertAtDefaultPosition && !window.__FR_iAD_orig) {
      window.__FR_iAD_orig = IE.insertAtDefaultPosition.bind(IE);
      IE.insertAtDefaultPosition = function(tool) {
        window.__FR.coverage.insertAtDefaultPosition = true;
        const sec = DS.sections.find(s => s.stype === 'det') || DS.sections[0];
        rec('insertAtDefault:enter', { tool, sectionId: sec?.id, sectionH: sec?.height, dsCount: DS?.elements.length });
        const r = window.__FR_iAD_orig(tool);
        const dsEls = DS?.elements || [];
        const last  = dsEls.length ? dsEls[dsEls.length - 1] : null;
        const div   = last ? document.querySelector(`.cr-element[data-id="${last.id}"]`) : null;
        const sec2  = div?.closest('.cr-section');
        rec('insertAtDefault:exit', {
          tool, dsCount: dsEls.length,
          domCount: document.querySelectorAll('.cr-element:not(#preview-content .cr-element)').length,
          newElId: last?.id, newElSectionId: last?.sectionId,
          divInDom: !!div, divInSection: !!div?.closest('.cr-section'), divInPreview: !!div?.closest('#preview-content'),
          sectionH: sec2 ? parseFloat(sec2.style.height) || null : null,
          divOffsetTop: div?.offsetTop, divOffsetH: div?.offsetHeight,
          canvasLayerClass: document.getElementById('canvas-layer')?.className,
        });
        return r;
      };
    }
    if (PEM && !window.__FR_pH_orig) {
      window.__FR_pH_orig = PEM.hide.bind(PEM);
      PEM.hide = function() {
        window.__FR.coverage.previewHide = true;
        rec('PreviewHide:enter', { canvasLayerClass: document.getElementById('canvas-layer')?.className });
        const r = window.__FR_pH_orig();
        rec('PreviewHide:exit',  { canvasLayerClass: document.getElementById('canvas-layer')?.className });
        return r;
      };
    }
    if (typeof DS !== 'undefined' && !window.__FR_sE_orig) {
      try {
        window.__FR_sE_orig = DS.setElements;
        DS.setElements = function(elements, source) {
          window.__FR.coverage.setElements = true;
          rec('DS.setElements', { source, before: DS.elements.length, after: elements.length });
          return window.__FR_sE_orig.call(this, elements, source);
        };
      } catch (_) { /* DS may be frozen */ }
    }
    if (CLE && !window.__FR_rE_orig) {
      window.__FR_rE_orig = CLE.renderElement;
      CLE.renderElement = function(el) {
        window.__FR.coverage.renderElement = true;
        rec('renderElement', { elId: el?.id, elType: el?.type, sectionId: el?.sectionId });
        return window.__FR_rE_orig.call(this, el);
      };
    }
    if (CLE && !window.__FR_rAll_orig) {
      window.__FR_rAll_orig = CLE.renderAll;
      CLE.renderAll = function() {
        window.__FR.coverage.renderAll = true;
        rec('renderAll', { domCount: document.querySelectorAll('.cr-element').length });
        return window.__FR_rAll_orig.call(this);
      };
    }
    if (SE && !window.__FR_rH_orig) {
      window.__FR_rH_orig = SE.renderHandles.bind(SE);
      SE.renderHandles = function() {
        window.__FR.coverage.renderHandles = true;
        rec('renderHandles', { dsSelection: DS ? [...DS.selection] : [] });
        return window.__FR_rH_orig();
      };
    }
    if (!window.__FR_wsObs) {
      const ws = document.getElementById('workspace');
      if (ws) {
        window.__FR_wsObs = new MutationObserver(ms => {
          ms.forEach(m => { if (m.attributeName === 'class') rec('workspace:class', { from: m.oldValue, to: ws.className }); });
        });
        window.__FR_wsObs.observe(ws, { attributes: true, attributeOldValue: true });
      }
    }
    if (!window.__FR_clObs) {
      const cl = document.getElementById('canvas-layer');
      if (cl) {
        window.__FR_clObs = new MutationObserver(ms => {
          ms.forEach(m => { if (m.attributeName === 'class') rec('canvasLayer:class', { from: m.oldValue, to: cl.className }); });
        });
        window.__FR_clObs.observe(cl, { attributes: true, attributeOldValue: true });
      }
    }
  });
}

async function resetCoverage(page) {
  await page.evaluate(() => {
    if (!window.__FR) return;
    window.__FR.events = [];
    window.__FR.coverage = {
      handleAction: false, setTool: false, insertAtDefaultPosition: false,
      previewHide: false, setElements: false, renderElement: false,
      renderAll: false, renderHandles: false,
    };
  });
}

// ── Full state probe (post-insert) ────────────────────────────────────────────
async function probeState(page, label) {
  return page.evaluate((lbl) => {
    const cl  = document.getElementById('canvas-layer');
    const pl  = document.getElementById('preview-layer');
    const ws  = document.getElementById('workspace');
    const dsEls  = typeof DS !== 'undefined' ? DS.elements : [];
    const domEls = document.querySelectorAll('.cr-element:not(#preview-content .cr-element)');
    const last   = dsEls.length ? dsEls[dsEls.length - 1] : null;

    let lastInDom = false, lastInSection = false, lastInPreview = false;
    let lastRect = null, lastParentSecId = null;
    let efpResult = null;

    if (last) {
      const div = document.querySelector(`.cr-element[data-id="${last.id}"]`);
      lastInDom       = !!div;
      lastInSection   = div ? !!div.closest('.cr-section') : false;
      lastInPreview   = div ? !!div.closest('#preview-content') : false;
      lastParentSecId = div?.parentElement?.dataset?.sectionId ?? null;
      if (div) {
        const r = div.getBoundingClientRect();
        lastRect = { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };

        // elementFromPoint at element center
        const ex = r.left + r.width  / 2;
        const ey = r.top  + r.height / 2;
        const efp = document.elementFromPoint(ex, ey);
        const hitLastEl = efp ? (efp === div || div.contains(efp) || efp.classList.contains('sel-handle')) : false;

        // Section bounds check (contain:paint clipping verdict)
        const sec = div.closest('.cr-section');
        const sectionH = sec ? parseFloat(sec.style.height) || 0 : 0;
        const elBottom = div.offsetTop + div.offsetHeight;

        efpResult = {
          efpTag:         efp ? efp.tagName : null,
          efpId:          efp ? (efp.id || null) : null,
          efpClass:       efp ? efp.className : null,
          hitLastEl,
          // CSS state
          divPointerEvents: getComputedStyle(div).pointerEvents,
          divDisplay:       getComputedStyle(div).display,
          divZIndex:        getComputedStyle(div).zIndex,
          // Section clipping
          sectionH,
          elOffsetTop:    div.offsetTop,
          elOffsetH:      div.offsetHeight,
          elBottom,
          containPaintClipped: elBottom > sectionH,
          // Workspace scroll
          wsScrollLeft: ws ? ws.scrollLeft : null,
          wsScrollTop:  ws ? ws.scrollTop  : null,
          ex: Math.round(ex), ey: Math.round(ey),
        };
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
      lastInDom, lastInSection, lastInPreview, lastParentSecId, lastRect, efpResult,
      coverage:         window.__FR?.coverage ?? {},
      eventLog:         window.__FR?.events   ?? [],
    };
  }, label);
}

// ── 3-click survival probe ────────────────────────────────────────────────────
async function clickSurvivalProbe(page, lastId, runLabel) {
  const clicks = [];
  for (let i = 1; i <= 3; i++) {
    const box = await page.locator(`.cr-element[data-id="${lastId}"]`).boundingBox().catch(() => null);
    if (!box) {
      clicks.push({ click: i, boxFound: false, inDom: false, note: 'NO BOUNDING BOX' });
      await ss(page, `${runLabel}-click-${i}-MISSING`);
      break;
    }
    await ss(page, `${runLabel}-click-${i}-before`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(350);
    const after = await page.evaluate((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      return {
        inDom:      !!el,
        inSection:  el ? !!el.closest('.cr-section') : false,
        inPreview:  el ? !!el.closest('#preview-content') : false,
        inDs:       (typeof DS !== 'undefined' ? DS.elements : []).some(e => e.id === id),
        dsCount:    typeof DS !== 'undefined' ? DS.elements.length : null,
        domCount:   document.querySelectorAll('.cr-element:not(#preview-content .cr-element)').length,
      };
    }, lastId);
    await ss(page, `${runLabel}-click-${i}-after`);
    clicks.push({ click: i, boxFound: true, ...after });
    if (!after.inDom) break;
  }
  return clicks;
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
console.log('\n' + '═'.repeat(72));
console.log('RF FLIGHT RECORDER — Preview → Insert (FIX INJECTED)');
console.log(`Target:  ${TARGET}`);
console.log(`Headed:  ${!HEADLESS}`);
console.log(`JSONL:   ${JSONL_PATH}`);
console.log('═'.repeat(72) + '\n');

const browser = await chromium.launch({
  headless: HEADLESS,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  slowMo: 80,
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
await ss(page, 'fix-injected-00-initial');

await injectFix(page);
await installInstrumentation(page);
console.log('Fix injected. Instrumentation installed.\n');

const results = [];

for (const tool of TOOLS) {
  const tag = tool.action;
  console.log('─'.repeat(72));
  console.log(`TOOL: ${tool.label} (${tag})`);

  await ensureDesign(page);
  await page.keyboard.press('Escape');
  await resetCoverage(page);

  const dsBefore  = await page.evaluate(() => DS.elements.length);
  const domBefore = await page.evaluate(() =>
    document.querySelectorAll('.cr-element:not(#preview-content .cr-element)').length);

  writeEvent({ phase: 'tool:start', action: tag, label: tool.label, dsBefore, domBefore });

  // Design baseline
  await ss(page, `${tag}-01-design`);

  // Enter Preview
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(1500);
  const s1 = await probeState(page, 'preview-active');
  await ss(page, `${tag}-02-preview`);
  writeEvent({ phase: 'preview-active', action: tag, ...s1 });
  console.log(`  Preview: canvas="${s1.canvasLayerClass}"  sectionDivs=${s1.sectionDivCount}`);

  // Trigger insert
  await page.locator('.menu-item[data-menu="insertar"]').click();
  await page.waitForSelector('#dd-insertar', { state: 'visible', timeout: 3000 });
  await page.locator(`#dd-insertar .dd-item[data-action="${tag}"]`).click();
  await page.waitForTimeout(600);

  const s2 = await probeState(page, 'post-insert');
  await ss(page, `${tag}-03-post-insert`);
  writeEvent({ phase: 'post-insert', action: tag, dsBefore, domBefore, ...s2 });

  const dsAfter  = s2.dsCount;
  const domAfter = s2.domCount;
  const efp      = s2.efpResult;

  console.log(`  post-insert: ds=${dsBefore}→${dsAfter}  dom=${domBefore}→${domAfter}`);
  console.log(`  canvas="${s2.canvasLayerClass}"  workspace="${s2.workspaceClass}"`);
  console.log(`  lastEl=${JSON.stringify(s2.lastEl)}`);
  console.log(`  lastInSection=${s2.lastInSection}  lastInPreview=${s2.lastInPreview}`);
  if (efp) {
    console.log(`  efp@(${efp.ex},${efp.ey}): tag=${efp.efpTag} class="${efp.efpClass}"`);
    console.log(`  hitLastEl=${efp.hitLastEl}  containPaintClipped=${efp.containPaintClipped}`);
    console.log(`  sectionH=${efp.sectionH}  elBottom=${efp.elBottom}  (offsetTop=${efp.elOffsetTop} + h=${efp.elOffsetH})`);
  }

  // 3-click survival
  let clickResults = [];
  if (s2.lastEl && dsAfter > dsBefore) {
    console.log(`  → 3-click survival on ${s2.lastEl.id}…`);
    clickResults = await clickSurvivalProbe(page, s2.lastEl.id, `${tag}-05`);
    clickResults.forEach(c => {
      const note = !c.boxFound ? '  ⚠ NO BOX' : (!c.inDom ? '  ✘ VANISHED' : '  ✔ survived');
      console.log(`    click ${c.click}: inDom=${c.inDom} inSection=${c.inSection}${note}`);
    });
    writeEvent({ phase: 'click-survival', action: tag, clicks: clickResults });
  }

  // Corruption signals
  const cov = s2.coverage;
  const corruption = {
    clipped:           efp ? efp.containPaintClipped : false,
    notHittable:       efp ? !efp.hitLastEl : false,
    workspaceClassLost:s2.workspaceClass ? !s2.workspaceClass.includes('workspace') : false,
    overlayActive:     !!s2.canvasLayerClass?.includes('preview-mode'),
    elemInPreview:     s2.lastInPreview,
    vanishedOnClick:   clickResults.some(c => !c.inDom),
  };
  const anyCorruption = Object.values(corruption).some(Boolean);
  if (anyCorruption) {
    console.log('  ⚠ CORRUPTION:', Object.entries(corruption).filter(([,v])=>v).map(([k])=>k).join(', '));
  } else {
    console.log('  ✔ No corruption signals');
  }

  results.push({
    label: tool.label, action: tag,
    setTool:        cov.setTool,
    previewHide:    cov.previewHide,
    insertDefault:  cov.insertAtDefaultPosition,
    setElements:    cov.setElements,
    renderElement:  cov.renderElement,
    renderHandles:  cov.renderHandles,
    dsPlus1:        dsAfter > dsBefore,
    domPlus1:       domAfter > domBefore,
    inSection:      s2.lastInSection,
    wsClassOK:      s2.workspaceClass ? s2.workspaceClass.includes('workspace') : null,
    overlayGone:    !s2.canvasLayerClass?.includes('preview-mode'),
    notClipped:     efp ? !efp.containPaintClipped : null,
    hittable:       efp ? efp.hitLastEl : null,
    survived:       !clickResults.some(c => !c.inDom),
    corruption,
  });

  writeEvent({ phase: 'tool:result', action: tag, result: results[results.length - 1] });

  // Reset
  await page.keyboard.press('Escape');
  await ensureDesign(page);
  await undo(page, dsBefore);
  await page.waitForTimeout(300);
}

// ── Coverage table ────────────────────────────────────────────────────────────
const B = v => v === true ? '✔' : v === false ? '✘' : '?';
const W = (s, n) => String(s ?? '?').padEnd(n);

console.log('\n\n' + '═'.repeat(130));
console.log('FLOW COVERAGE + CORRUPTION MATRIX — FIX INJECTED');
console.log('═'.repeat(130));
console.log([
  W('Opción',12), W('setTool',9), W('hide',7), W('insDefault',11),
  W('setElements',12), W('renderEl',10), W('rHandles',10),
  W('DS+1',6), W('DOM+1',6), W('inSection',10),
  W('wsOK',6), W('overlay',8), W('notClipped',11), W('hittable',9), W('survived',9),
].join('|'));
console.log('─'.repeat(130));
for (const r of results) {
  console.log([
    W(r.label,12), W(B(r.setTool),9), W(B(r.previewHide),7), W(B(r.insertDefault),11),
    W(B(r.setElements),12), W(B(r.renderElement),10), W(B(r.renderHandles),10),
    W(B(r.dsPlus1),6), W(B(r.domPlus1),6), W(B(r.inSection),10),
    W(B(r.wsClassOK),6), W(B(r.overlayGone),8), W(B(r.notClipped),11), W(B(r.hittable),9), W(B(r.survived),9),
  ].join('|'));
}
console.log('═'.repeat(130));

if (consoleErrors.length) {
  console.log(`\nCONSOLE ERRORS (${consoleErrors.length}):`);
  consoleErrors.slice(0, 20).forEach(e => console.log('  ' + e));
} else {
  console.log('\nConsole errors: none ✔');
}

console.log(`\nJSONL:       ${JSONL_PATH}`);
console.log(`Screenshots: ${OUT_DIR}/`);

await browser.close();
