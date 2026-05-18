#!/usr/bin/env node
/**
 * ruler_rendered_geometry_guard.mjs
 *
 * Playwright driver for ruler pixel contracts.
 * Validates INV-1…INV-13 (geometry, clipping, DPR, backing store, painted area)
 * in Chromium and Firefox in parallel.
 *
 * Delegates all measurement logic to:
 *   audit/pixel-contracts.mjs        — generic contract runner
 *   audit/ruler_pixel_contracts.mjs  — ruler-specific contract declarations
 *
 * Exit codes (strict CI gate):
 *   0 = ALL browsers PASS
 *   1 = contract violation(s) — geometry, DPR, overflow, painted area
 *   2 = infrastructure failure — measurement error, scan failed, or Playwright crash
 *
 * Exit 2 is unconditional: any MEASURE-* or PIXEL-SCAN-FAILED violation
 * means we have no data to reason from.  No soft tolerance applies.
 *
 * Usage:
 *   node audit/ruler_rendered_geometry_guard.mjs
 */

import { spawn }                                  from 'node:child_process';
import { fileURLToPath }                          from 'node:url';
import path                                       from 'node:path';
import { createHash }                             from 'node:crypto';
import { readFileSync }                           from 'node:fs';
import { chromium, firefox }                      from 'playwright';
import { runContracts, classifyViolations }        from './pixel-contracts.mjs';
import { RULER_CONTRACTS, RULER_CANVAS_SELECTORS } from './ruler_pixel_contracts.mjs';

const ROOT        = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT        = 29873;
const BASE        = `http://127.0.0.1:${PORT}/`;
const TIMEOUT     = 40_000;
const ARTIFACTS   = '/tmp/rf_ruler_artifacts';
const SEP         = '─'.repeat(64);

// ── SSOT file hashes ──────────────────────────────────────────────────────────
function sha256short(relPath) {
  try {
    return createHash('sha256').update(readFileSync(path.join(ROOT, relPath))).digest('hex').slice(0, 16);
  } catch { return '(unreadable)'; }
}

// ── Server ────────────────────────────────────────────────────────────────────
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

// ── Single-browser run ────────────────────────────────────────────────────────
async function runInBrowser(browserType, browserName) {
  const browser = await browserType.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page         = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(`PAGEERROR: ${e.message}`));

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: TIMEOUT });

    // Wait for full runtime boot + ruler canvases rendered
    await page.waitForFunction(
      () => typeof RF !== 'undefined' && RF.RuntimeConfig &&
            typeof DS !== 'undefined' && Array.isArray(DS.sections) && DS.sections.length > 0,
      { timeout: TIMEOUT },
    );
    await page.waitForFunction(
      (selectors) => selectors.every(sel => {
        const el = document.querySelector(sel);
        return el && el.width > 0 && el.height > 0;
      }),
      { timeout: TIMEOUT },
      RULER_CANVAS_SELECTORS,
    );
    await page.waitForTimeout(500); // settle pending rAF

    // Read RuntimeConfig for INV-10/INV-11 custom validators
    const context = await page.evaluate(
      () => window.RF?.RuntimeConfig?.ruler ?? null,
    );

    const { violations, measurements, pixelData } = await runContracts(
      page,
      RULER_CONTRACTS,
      {
        artifactsDir: ARTIFACTS,
        label:        browserName.toLowerCase(),
        context,
      },
    );

    return { browserName, violations, measurements, pixelData, consoleErrors };
  } finally {
    await browser.close();
  }
}

// ── Print result for one browser ──────────────────────────────────────────────
function printBrowserResult({ browserName, violations, measurements, pixelData, consoleErrors }) {
  console.log(`\n${SEP}`);
  console.log(`🌐  ${browserName}`);
  console.log(SEP);

  // Key geometry measurements
  const hRow = measurements['#ruler-h-row'];
  const vCol = measurements['#ruler-v'];
  const dpr  = hRow?.dpr ?? '?';
  if (hRow?.rect && vCol?.rect) {
    const pad = s => s.padEnd(40);
    console.log(`   ${pad('devicePixelRatio')}${dpr}`);
    console.log(`   ${pad('#ruler-h-row  h')}${hRow.rect.h.toFixed(2)} px`);
    console.log(`   ${pad('#ruler-v      w')}${vCol.rect.w.toFixed(2)} px`);
  }

  if (pixelData?.ok) {
    const top  = pixelData.regions['ruler-h-row-scan']?.paintedThickness ?? '—';
    const side = pixelData.regions['ruler-v-col-scan']?.paintedThickness ?? '—';
    console.log(`   ${'paintedTop / paintedSide'.padEnd(40)}${top} / ${side} px`);
    if (pixelData._debugPng) console.log(`   debug PNG → ${pixelData._debugPng}`);
  }

  if (violations.length === 0) {
    console.log(`\n   ✅  All contracts PASS`);
    return;
  }

  // Separate infra failures from contract failures — different exit codes below.
  const { infra, contract } = classifyViolations(violations);

  if (infra.length > 0) {
    console.log(`\n   🚨  ${infra.length} INFRASTRUCTURE failure(s) — measurement data absent, result unknown:`);
    for (const v of infra)
      console.log(`      [${v.id}] ${v.contract}: ${v.detail}`);
  }
  if (contract.length > 0) {
    console.log(`\n   ❌  ${contract.length} contract violation(s):`);
    for (const v of contract)
      console.log(`      [${v.id}] ${v.contract}: ${v.detail}`);
  }

  if (consoleErrors.length > 0) {
    console.log(`\n   ⚠  ${consoleErrors.length} browser console error(s):`);
    consoleErrors.slice(0, 3).forEach(e => console.log(`      ${e.slice(0, 120)}`));
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
let server = null;
try {
  console.log(`\n${SEP}`);
  console.log('🔬  Ruler Pixel Contract Guard  ·  Chromium + Firefox');
  console.log(`    URL: ${BASE}   viewport: 1440×980`);
  console.log(SEP);

  const KEY_FILES = ['engines/RuntimeConfig.js', 'designer/styles/tokens.css', 'designer/styles/canvas.css'];
  console.log('\n   SSOT SHA-256 (first 16 chars):');
  for (const f of KEY_FILES)
    console.log(`   ${f.padEnd(42)} ${sha256short(f)}`);

  process.stdout.write('\n   Starting server … ');
  server = await startServer();
  console.log('ready');

  process.stdout.write('   Launching Chromium + Firefox in parallel … ');
  const [chromiumResult, firefoxResult] = await Promise.allSettled([
    runInBrowser(chromium, 'Chromium'),
    runInBrowser(firefox,  'Firefox'),
  ]);
  console.log('done');

  let totalInfra    = 0;   // MEASURE-* / PIXEL-SCAN-FAILED → exit 2
  let totalContract = 0;   // geometry violations → exit 1
  const summaries   = [];

  for (const settled of [chromiumResult, firefoxResult]) {
    if (settled.status === 'rejected') {
      console.log(`\n${SEP}\n   🚨  LAUNCH ERROR: ${settled.reason?.message}`);
      totalInfra++;
      summaries.push({ status: 'INFRA-ERROR' });
      continue;
    }
    printBrowserResult(settled.value);
    const { infra, contract } = classifyViolations(settled.value.violations);
    totalInfra    += infra.length;
    totalContract += contract.length;
    summaries.push({
      name:     settled.value.browserName,
      status:   infra.length > 0 ? 'INFRA-ERROR' : contract.length > 0 ? 'FAIL' : 'PASS',
      infraCnt: infra.length,
      contractCnt: contract.length,
      hH:       settled.value.measurements['#ruler-h-row']?.rect?.h,
      vW:       settled.value.measurements['#ruler-v']?.rect?.w,
    });
  }

  // ── Cross-browser consistency (contract-level, not infra) ──────────────────
  const measured = summaries.filter(s => s.hH !== undefined);
  if (measured.length === 2) {
    const [a, b]  = measured;
    const diffH   = Math.abs(a.hH - b.hH);
    const diffW   = Math.abs(a.vW - b.vW);
    const crossOk = diffH <= 1.5 && diffW <= 1.5;
    console.log(`\n${SEP}\n🔀  Cross-browser consistency`);
    console.log(SEP);
    console.log(`   ${diffH <= 1.5 ? '✅' : '❌'}  topRuler.h : ${a.name}=${a.hH?.toFixed(1)}  ${b.name}=${b.hH?.toFixed(1)}  diff=${diffH.toFixed(2)}px`);
    console.log(`   ${diffW <= 1.5 ? '✅' : '❌'}  sideRuler.w: ${a.name}=${a.vW?.toFixed(1)}  ${b.name}=${b.vW?.toFixed(1)}  diff=${diffW.toFixed(2)}px`);
    if (!crossOk) totalContract++;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${SEP}\n📋  Summary`);
  console.log(SEP);
  for (const s of summaries) {
    const sym = s.status === 'PASS' ? '✅' : s.status === 'INFRA-ERROR' ? '🚨' : '❌';
    const detail = s.status === 'PASS' ? '' :
      s.status === 'INFRA-ERROR' ? `  infra=${s.infraCnt ?? 1}` :
      `  infra=${s.infraCnt} contract=${s.contractCnt}`;
    console.log(`   ${sym}  ${(s.name ?? 'unknown').padEnd(12)} ${s.status}${detail}`);
  }
  console.log('');

  // Infra failures take priority: we have no reliable data.
  if (totalInfra > 0) {
    console.log(`🚨  INFRA FAILURE — ${totalInfra} measurement/scan error(s). Cannot reason about geometry.`);
    console.log(`    Fix infrastructure before interpreting contract results.\n${SEP}`);
    server.kill('SIGINT');
    process.exit(2);
  }
  if (totalContract > 0) {
    console.log(`❌  FAIL — ${totalContract} contract violation(s). Artifacts: ${ARTIFACTS}\n${SEP}`);
    server.kill('SIGINT');
    process.exit(1);
  }
  console.log(`✅  PASS — All ruler pixel contracts satisfied.\n${SEP}`);
  server.kill('SIGINT');
  process.exit(0);

} catch (err) {
  console.error(`\n❌  INFRA ERROR — ${err.message}`);
  if (server) server.kill('SIGINT');
  process.exit(2);
}
