'use strict';
/**
 * RF PREVIEW-INSERT STAY-IN-PREVIEW — CONTROLLED EXPERIMENT (GATE)
 * ─────────────────────────────────────────────────────────────────────
 * DIAGNOSTIC TOOL — NOT a CI test. Run manually only.
 *
 * Purpose:
 *   PROVE, with runtime evidence, the full chain that lets Preview→Insert
 *   stay in Preview WITHOUT touching production code:
 *
 *     insert into DS (no hide)  →  DS.saveHistory() with previewMode=true
 *       →  CommandRuntimeInit patch fires refresh()
 *       →  /designer-preview re-renders from live toJSON()
 *       →  #preview-content shows the new element (hittable .pv-el)
 *       →  DS.previewMode stays true, #canvas-layer keeps preview-mode
 *
 *   Simulates the removed-hide path EXACTLY by calling
 *   InsertEngine.insertAtDefaultPosition(tool) while in preview, without
 *   calling PreviewEngineMode.hide() first. No production file is modified.
 *
 * Evidence capture (alias-proof):
 *   - refresh INVOCATIONS  = count of POST /designer-preview (network)
 *   - EFFECTIVE APPLIES    = count of PreviewEngineRendererLayout._applyCleanHtml calls
 *   - rf-preview-rendered  = event count
 *   - DS.saveHistory       = wrapped to record previewMode at call time
 *
 * Asserts the chain (a)–(h). Prints a GATE verdict: PROVEN → Option 1,
 * else STOP (report failing link).
 *
 * Usage:
 *   node --experimental-vm-modules tools/diagnostics/rf-preview-insert/rf_preview_insert_stay_experiment.mjs
 *   HEADLESS=1 ... (headless)   FLIGHT_URL=http://host:port/ ... (custom target)
 */

import path from 'node:path';
import fs   from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR    = path.resolve(__dirname, '../../../scratchpad/flight-recorder');
const TIMESTAMP  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const JSONL_PATH = path.join(OUT_DIR, `stay-experiment-${TIMESTAMP}.jsonl`);
const TARGET     = process.env.FLIGHT_URL || 'http://localhost:5001/';
const HEADLESS   = process.env.HEADLESS === '1';

const TOOLS = [
  { tool: 'text',    label: 'Texto'      },
  { tool: 'field',   label: 'Campo'      },
  { tool: 'line',    label: 'Línea H'    },
  { tool: 'line-v',  label: 'Línea V'    },
  { tool: 'box',     label: 'Rectángulo' },
  { tool: 'barcode', label: 'Barcode'    },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
function writeEvent(o) { fs.appendFileSync(JSONL_PATH, JSON.stringify({ _ts: Date.now(), ...o }) + '\n'); }

// ── Network counter for /designer-preview (refresh invocations) ───────────────
let previewPostCount = 0;

// ── In-page instrumentation (effective applies, saveHistory, events) ──────────
async function installInstrumentation(page) {
  await page.evaluate(() => {
    window.__EXP = { applyCount: 0, saveHistoryCalls: [], previewRendered: 0 };

    // Effective applies — wrap _applyCleanHtml (the real DOM write inside refresh)
    const L = window.PreviewEngineRendererLayout;
    if (L && typeof L._applyCleanHtml === 'function' && !window.__EXP_acl) {
      window.__EXP_acl = L._applyCleanHtml;
      L._applyCleanHtml = function(...args) {
        window.__EXP.applyCount++;
        return window.__EXP_acl.apply(this, args);
      };
    }

    // saveHistory — wrap on top of the already-patched version; record previewMode at call time
    if (typeof DS !== 'undefined' && typeof DS.saveHistory === 'function' && !window.__EXP_sh) {
      window.__EXP_sh = DS.saveHistory;
      DS.saveHistory = function(...args) {
        window.__EXP.saveHistoryCalls.push({ previewMode: !!DS.previewMode, t: performance.now() });
        return window.__EXP_sh.apply(this, args);
      };
    }

    // rf-preview-rendered events
    if (!window.__EXP_evt) {
      window.__EXP_evt = true;
      document.addEventListener('rf-preview-rendered', () => { window.__EXP.previewRendered++; });
    }
  });
}

async function resetCounters(page) {
  previewPostCount = 0;
  await page.evaluate(() => {
    if (window.__EXP) { window.__EXP.applyCount = 0; window.__EXP.saveHistoryCalls = []; window.__EXP.previewRendered = 0; }
  });
}

// ── Build a det element + run the EXACT removed-hide tail (no hide()) ──────────
async function insertWithoutHide(page, tool) {
  return page.evaluate((tool) => {
    // Snapshot pre-state
    const cl0 = document.getElementById('canvas-layer');
    const pre = {
      previewMode: !!DS.previewMode,
      canvasPreviewMode: cl0 ? cl0.classList.contains('preview-mode') : false,
      dsCount: DS.elements.length,
    };

    // This is the EXACT body of InsertEngine.insertAtDefaultPosition, invoked
    // directly while in preview, WITHOUT PreviewEngineMode.hide() first.
    // We call the real production method so we exercise production logic verbatim.
    DS.selectOnly && null; // no-op marker
    const beforeId = DS.elements.length ? DS.elements[DS.elements.length - 1].id : null;

    // Call the real production insertAtDefaultPosition (includes DS.saveHistory + setTool('pointer'))
    InsertEngine.insertAtDefaultPosition(tool);

    const last = DS.elements.length ? DS.elements[DS.elements.length - 1] : null;
    const cl1 = document.getElementById('canvas-layer');
    return {
      pre,
      newElId: last ? last.id : null,
      newElType: last ? last.type : null,
      newElSectionId: last ? last.sectionId : null,
      addedNew: last && last.id !== beforeId,
      // Immediately-after (synchronous) state — refresh is async, not yet applied
      syncAfter: {
        previewMode: !!DS.previewMode,
        canvasPreviewMode: cl1 ? cl1.classList.contains('preview-mode') : false,
        dsCount: DS.elements.length,
      },
    };
  }, tool);
}

// ── After async refresh settles: probe preview DOM + elementFromPoint ─────────
async function probePreviewAfterRefresh(page, newElId) {
  return page.evaluate((id) => {
    const cl = document.getElementById('canvas-layer');
    const pc = document.getElementById('preview-content');
    const sl = document.getElementById('sections-layer');

    // Element present in preview-content (hit layer .pv-el or render node)
    const inPreview = pc
      ? pc.querySelector(`[data-id="${id}"], [data-origin-id="${id}"]`)
      : null;

    // elementFromPoint at the preview element's rect center
    let efp = null;
    if (inPreview) {
      const r = inPreview.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const ex = r.left + r.width / 2;
        const ey = r.top + r.height / 2;
        const node = document.elementFromPoint(ex, ey);
        efp = {
          ex: Math.round(ex), ey: Math.round(ey),
          tag: node ? node.tagName : null,
          cls: node ? node.className : null,
          insidePreviewContent: node ? (pc ? pc.contains(node) : false) : false,
          insideSectionsLayer: node ? (sl ? sl.contains(node) : false) : false,
          rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        };
      } else {
        efp = { degenerate: true, rect: { w: Math.round(r.width), h: Math.round(r.height) } };
      }
    }

    return {
      previewMode: !!DS.previewMode,
      canvasPreviewMode: cl ? cl.classList.contains('preview-mode') : false,
      sectionsLayerDisplay: sl ? getComputedStyle(sl).display : null,
      inPreviewFound: !!inPreview,
      pvElCount: pc ? pc.querySelectorAll(`[data-id="${id}"], [data-origin-id="${id}"]`).length : 0,
      efp,
      // counters
      applyCount: window.__EXP ? window.__EXP.applyCount : null,
      saveHistoryCalls: window.__EXP ? window.__EXP.saveHistoryCalls.slice() : [],
      previewRendered: window.__EXP ? window.__EXP.previewRendered : null,
    };
  }, newElId);
}

async function ensureDesign(page) {
  const inPrev = await page.evaluate(() => typeof DS !== 'undefined' && DS.previewMode);
  if (inPrev) { await page.locator('#tab-design').click(); await page.waitForTimeout(400); }
}
async function undo(page, beforeCount) {
  const n = await page.evaluate(() => DS.elements.length);
  if (n > beforeCount) { await page.keyboard.press('Control+z'); await page.waitForTimeout(300); }
}

// ── Assertion helpers ─────────────────────────────────────────────────────────
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', X = '\x1b[0m';
function mark(ok) { return ok ? `${G}✔${X}` : `${R}✘${X}`; }

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(74));
console.log('RF PREVIEW-INSERT STAY-IN-PREVIEW — CONTROLLED EXPERIMENT (GATE)');
console.log(`Target:  ${TARGET}`);
console.log(`Headed:  ${!HEADLESS}`);
console.log(`JSONL:   ${JSONL_PATH}`);
console.log('═'.repeat(74) + '\n');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox', '--disable-dev-shm-usage'], slowMo: 60 });
const page    = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(`PAGEERROR: ${e.message}`));
// Count refresh invocations via network (alias-proof)
page.on('request', req => {
  if (req.method() === 'POST' && req.url().includes('/designer-preview')) previewPostCount++;
});

await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
  await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
} catch { console.error('Page not ready — is localhost:5001 running?'); await browser.close(); process.exit(1); }
await page.waitForTimeout(800);

await installInstrumentation(page);
console.log('Instrumentation installed (applyCleanHtml, saveHistory, rf-preview-rendered, network).\n');

const results = [];

for (const T of TOOLS) {
  console.log('─'.repeat(74));
  console.log(`TOOL: ${T.label} (${T.tool})`);

  await ensureDesign(page);
  await page.keyboard.press('Escape');

  const beforeCount = await page.evaluate(() => DS.elements.length);

  // Enter Preview, wait for first render to settle
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(1500);

  // Reset counters AFTER entering preview (so we isolate the insert's refresh)
  await resetCounters(page);
  const postCountAtInsertStart = previewPostCount; // should be 0 after reset

  // Perform the removed-hide insert (calls production insertAtDefaultPosition, no hide)
  const ins = await insertWithoutHide(page, T.tool);
  writeEvent({ phase: 'insert', tool: T.tool, ...ins });

  // Wait for async refresh to complete (network + apply + event)
  let waited = 0;
  while (waited < 6000) {
    const done = await page.evaluate(() => (window.__EXP?.applyCount || 0) > 0);
    if (done && previewPostCount > postCountAtInsertStart) break;
    await page.waitForTimeout(150);
    waited += 150;
  }
  await page.waitForTimeout(400); // settle

  const probe = await probePreviewAfterRefresh(page, ins.newElId);
  writeEvent({ phase: 'probe', tool: T.tool, previewPostCount, ...probe });

  // ── Evaluate chain (a)–(h) ─────────────────────────────────────────────────
  const shInPreview = probe.saveHistoryCalls.some(c => c.previewMode === true);
  const efp = probe.efp;
  const chain = {
    a_dsPlus1:        ins.addedNew && probe /* still in DS */ && (ins.syncAfter.dsCount > ins.pre.dsCount),
    b_previewTrue:    probe.previewMode === true && ins.syncAfter.previewMode === true,
    c_canvasPreview:  probe.canvasPreviewMode === true && ins.syncAfter.canvasPreviewMode === true,
    d_saveHistory:    shInPreview,
    e_refreshFired:   previewPostCount > postCountAtInsertStart && probe.previewRendered > 0,
    f_oneApply:       probe.applyCount === 1,
    g_inPreviewDom:   probe.inPreviewFound === true,
    h_efpPreview:     !!efp && !efp.degenerate && efp.insidePreviewContent === true && efp.insideSectionsLayer === false,
  };
  const allPass = Object.values(chain).every(Boolean);

  console.log(`  (a) DS.elements +1 .......................... ${mark(chain.a_dsPlus1)}  (${ins.pre.dsCount}→${ins.syncAfter.dsCount}, id=${ins.newElId})`);
  console.log(`  (b) DS.previewMode stays true .............. ${mark(chain.b_previewTrue)}`);
  console.log(`  (c) #canvas-layer keeps preview-mode ...... ${mark(chain.c_canvasPreview)}`);
  console.log(`  (d) saveHistory fired w/ previewMode=true . ${mark(chain.d_saveHistory)}  (calls=${probe.saveHistoryCalls.length})`);
  console.log(`  (e) refresh fired (POST + event) .......... ${mark(chain.e_refreshFired)}  (posts=${previewPostCount}, events=${probe.previewRendered})`);
  console.log(`  (f) exactly one effective apply ........... ${mark(chain.f_oneApply)}  (applyCount=${probe.applyCount})`);
  console.log(`  (g) element present in #preview-content ... ${mark(chain.g_inPreviewDom)}  (pvElCount=${probe.pvElCount})`);
  if (efp && !efp.degenerate) {
    console.log(`  (h) elementFromPoint → preview node ....... ${mark(chain.h_efpPreview)}  (@${efp.ex},${efp.ey} tag=${efp.tag} inPC=${efp.insidePreviewContent} inSL=${efp.insideSectionsLayer})`);
  } else {
    console.log(`  (h) elementFromPoint → preview node ....... ${mark(chain.h_efpPreview)}  (${efp ? 'degenerate rect '+JSON.stringify(efp.rect) : 'no preview node found'})`);
  }
  console.log(`  sections-layer display: ${probe.sectionsLayerDisplay}`);
  console.log(`  → ${allPass ? G+'ALL LINKS PROVEN'+X : R+'LINK(S) FAILED'+X}`);

  results.push({ tool: T.tool, label: T.label, chain, allPass,
    counters: { posts: previewPostCount, applies: probe.applyCount, events: probe.previewRendered },
    efp });
  writeEvent({ phase: 'verdict', tool: T.tool, chain, allPass });

  // Reset for next tool
  await ensureDesign(page);
  await undo(page, beforeCount);
  await page.waitForTimeout(300);
}

// ── GATE verdict ──────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(74));
console.log('GATE SUMMARY');
console.log('═'.repeat(74));
const KEYS = ['a_dsPlus1','b_previewTrue','c_canvasPreview','d_saveHistory','e_refreshFired','f_oneApply','g_inPreviewDom','h_efpPreview'];
const HDR = ['Tool'.padEnd(12), ...KEYS.map(k => k.split('_')[0].padEnd(3))].join(' ');
console.log(HDR);
console.log('─'.repeat(74));
for (const r of results) {
  console.log([r.label.padEnd(12), ...KEYS.map(k => (r.chain[k] ? `${G}✔${X}` : `${R}✘${X}`).padEnd(3 + 9))].join(' '));
}
console.log('─'.repeat(74));

const gatePass = results.every(r => r.allPass);
if (gatePass) {
  console.log(`${G}GATE PROVEN — all (a)–(h) PASS for all ${results.length} tools → proceed with Option 1${X}`);
} else {
  console.log(`${R}GATE FAILED — at least one link unproven → STOP, report, consider Option 2${X}`);
  for (const r of results) {
    if (!r.allPass) {
      const failed = KEYS.filter(k => !r.chain[k]).map(k => k.split('_')[0]);
      console.log(`  ${r.label}: failing links → ${failed.join(', ')}`);
    }
  }
}

if (consoleErrors.length) {
  console.log(`\n${Y}Console errors (${consoleErrors.length}):${X}`);
  consoleErrors.slice(0, 15).forEach(e => console.log('  ' + e));
} else {
  console.log('\nConsole errors: none ✔');
}

console.log(`\nJSONL: ${JSONL_PATH}`);

await browser.close();
process.exit(gatePass ? 0 : 1);
