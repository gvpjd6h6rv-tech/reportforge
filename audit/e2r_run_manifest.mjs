#!/usr/bin/env node
/**
 * E2R Run Manifest — Evidencia de Ejecución Real
 *
 * Runs each *.test.mjs file in reportforge/tests/ individually via `node --test`,
 * captures real exit-code per file, and writes audit/e2r_run_manifest.json.
 *
 * Rules:
 *   - NO hardcoded file lists — files discovered from filesystem at runtime.
 *   - NO glob as evidence — every entry in the manifest reflects an actual execution.
 *   - NO runner inference — runner is explicit: we call `node --test`.
 *   - Exits 0 always (except: no test files found, or manifest write failure).
 *   - ALWAYS terminates — no hanging pipes, no orphan handles.
 *
 * result values:
 *   "pass"    — node --test exited 0
 *   "fail"    — node --test exited non-0
 *   "timeout" — did not complete within PER_FILE_TIMEOUT_MS
 */

import { readdirSync, writeFileSync } from 'node:fs';
import { spawn }                      from 'node:child_process';
import { resolve, relative, join }    from 'node:path';
import { fileURLToPath }              from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = resolve(__dirname, '..');
const TESTS_DIR = join(ROOT, 'reportforge', 'tests');
const OUTPUT    = join(__dirname, 'e2r_run_manifest.json');

const PER_FILE_TIMEOUT_MS = 12_000;   // enough for tanda11 (~6 s) and slow node tests; browser tests → timeout
const GLOBAL_TIMEOUT_MS   = 120_000;  // hard ceiling for the whole script

// ── Global safety-net timer ───────────────────────────────────────────────────
// If the script somehow stalls past the ceiling, write whatever we have and exit.
let entries = [];
const globalTimer = setTimeout(() => {
  writeManifest();
  process.exit(0);
}, GLOBAL_TIMEOUT_MS);
globalTimer.unref(); // doesn't prevent normal exit

// ── File discovery ────────────────────────────────────────────────────────────
const testFiles = readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => join(TESTS_DIR, f));

if (testFiles.length === 0) {
  console.error('E2R manifest: no *.test.mjs files found in', TESTS_DIR);
  process.exit(1);
}

// ── Per-file runner ───────────────────────────────────────────────────────────
function runFile(absPath) {
  return new Promise((resolve) => {
    // detached: true → child runs as process group leader so we can kill the
    //                   whole group (catches Playwright browsers, etc.)
    // stdio: 'ignore' → no pipe buffers to fill/deadlock
    const child = spawn('node', ['--test', absPath], {
      stdio:    'ignore',
      detached: true,
    });
    // unref so the child doesn't keep our event loop alive if we time out
    child.unref();

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Kill entire process group to reap Playwright / server children
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {}
      try { child.kill('SIGKILL'); }              catch (_) {}
      resolve('timeout');
    }, PER_FILE_TIMEOUT_MS);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code === 0 ? 'pass' : 'fail');
    });

    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve('fail');
    });
  });
}

// ── Write manifest ────────────────────────────────────────────────────────────
function writeManifest() {
  writeFileSync(OUTPUT, JSON.stringify(entries, null, 2) + '\n');
}

// ── Main — run all files in parallel ─────────────────────────────────────────
const results = await Promise.all(
  testFiles.map(async (absPath) => {
    const relPath = relative(ROOT, absPath).replace(/\\/g, '/');
    const result  = await runFile(absPath);
    return { file: relPath, runner: 'node:test', command: `node --test ${relPath}`, filter: null, result };
  })
);
entries = results.sort((a, b) => a.file.localeCompare(b.file));

writeManifest();
clearTimeout(globalTimer);

const passed  = entries.filter((e) => e.result === 'pass').length;
const failed  = entries.filter((e) => e.result === 'fail').length;
const timedOut = entries.filter((e) => e.result === 'timeout').length;

const failNote    = failed   > 0 ? ` | ${failed} fail`                        : '';
const timeoutNote = timedOut > 0 ? ` | ${timedOut} timeout (browser env req)` : '';
console.log(`E2R manifest: ${passed}/${entries.length} passed${failNote}${timeoutNote} → ${relative(ROOT, OUTPUT)}`);

process.exit(0);
