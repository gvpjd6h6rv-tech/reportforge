#!/usr/bin/env node
/**
 * E2R Run Manifest — Evidencia de Ejecución Real (multi-runner)
 *
 * Runners soportados:
 *   node:test          — *.test.mjs en reportforge/tests/ (no recursivo)
 *   playwright         — *.test.mjs en reportforge/tests/user_parity/
 *   runtime-regression — reportforge/tests/run_runtime_regression.mjs
 *   pytest             — *.py declarados en subsystem_ownership_map.json existingTests
 *
 * Reglas:
 *   - Cada entrada refleja ejecución real — sin inferencia por nombre.
 *   - result: "pass" | "fail" | "timeout" | "unavailable"
 *   - "unavailable" solo si el runner no está instalado (pytest).
 *   - Exits 0 siempre — manifest es evidencia, no gate.
 *   - SIEMPRE termina — sin handles abiertos, sin pipes que bloqueen.
 */

import { readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync }                                      from 'node:child_process';
import { resolve, relative, join, dirname }                      from 'node:path';
import { fileURLToPath }                                         from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const TESTS_DIR = join(ROOT, 'reportforge', 'tests');
const OUTPUT    = join(__dirname, 'e2r_run_manifest.json');

const TIMEOUT_MS = {
  NODE_TEST:          12_000,
  PLAYWRIGHT:         45_000,
  RUNTIME_REGRESSION: 120_000,
  PYTEST:             20_000,
  GLOBAL:             180_000,
};

// ── Global safety-net ─────────────────────────────────────────────────────────
let entries = [];
const globalTimer = setTimeout(() => { writeManifest(); process.exit(0); }, TIMEOUT_MS.GLOBAL);
globalTimer.unref();

// ── Core runner ───────────────────────────────────────────────────────────────
function runProcess(args, timeoutMs) {
  return new Promise((res) => {
    const t0    = Date.now();
    const child = spawn(args[0], args.slice(1), { stdio: 'ignore', detached: true });
    child.unref();
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {}
      try { child.kill('SIGKILL'); }              catch (_) {}
      res({ result: 'timeout', durationMs: Date.now() - t0 });
    }, timeoutMs);

    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      res({ result: code === 0 ? 'pass' : 'fail', durationMs: Date.now() - t0 });
    });
    child.on('error', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      res({ result: 'fail', durationMs: Date.now() - t0 });
    });
  });
}

function writeManifest() {
  writeFileSync(OUTPUT, JSON.stringify(entries, null, 2) + '\n');
}

// ── Runner availability ───────────────────────────────────────────────────────
const pytestAvailable = (() => {
  const r = spawnSync('python3', ['-m', 'pytest', '--version'],
    { stdio: 'pipe', timeout: 5_000 });
  return r.status === 0;
})();

// ── File discovery ────────────────────────────────────────────────────────────

// 1. node:test — reportforge/tests/*.test.mjs
const nodeTestFiles = readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => join(TESTS_DIR, f));

// 2. playwright — reportforge/tests/user_parity/*.test.mjs
const userParityDir  = join(TESTS_DIR, 'user_parity');
const playwrightFiles = existsSync(userParityDir)
  ? readdirSync(userParityDir)
      .filter((f) => f.endsWith('.test.mjs'))
      .sort()
      .map((f) => join(userParityDir, f))
  : [];

// 3. runtime-regression — single entry
const runtimeRegressionFile = join(TESTS_DIR, 'run_runtime_regression.mjs');

// 4. pytest — unique .py files declared in ownership map existingTests
const ownershipMap  = JSON.parse(readFileSync(join(__dirname, 'subsystem_ownership_map.json'), 'utf8'));
const pytestFilesSet = new Set();
for (const sub of ownershipMap.subsystems ?? []) {
  for (const t of sub.existingTests ?? []) {
    if (t.endsWith('.py')) pytestFilesSet.add(t);
  }
}
const pytestFiles = [...pytestFilesSet]
  .sort()
  .filter((relPath) => existsSync(join(ROOT, relPath)));

// ── Build task list ───────────────────────────────────────────────────────────

const tasks = [];

// node:test
for (const absPath of nodeTestFiles) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  tasks.push({ rel, runner: 'node:test',
    args: ['node', '--test', absPath], timeout: TIMEOUT_MS.NODE_TEST });
}

// playwright (user_parity)
for (const absPath of playwrightFiles) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  tasks.push({ rel, runner: 'playwright',
    args: ['node', '--test', absPath], timeout: TIMEOUT_MS.PLAYWRIGHT });
}

// runtime-regression
if (existsSync(runtimeRegressionFile)) {
  const rel = relative(ROOT, runtimeRegressionFile).replace(/\\/g, '/');
  tasks.push({ rel, runner: 'runtime-regression',
    args: ['node', runtimeRegressionFile], timeout: TIMEOUT_MS.RUNTIME_REGRESSION });
}

// pytest
for (const relPath of pytestFiles) {
  const absPath = join(ROOT, relPath);
  if (!pytestAvailable) {
    tasks.push({ rel: relPath, runner: 'pytest',
      args: null, timeout: 0, unavailable: true });
  } else {
    tasks.push({ rel: relPath, runner: 'pytest',
      args: ['python3', '-m', 'pytest', absPath, '-q', '--tb=no'],
      timeout: TIMEOUT_MS.PYTEST });
  }
}

if (tasks.length === 0) {
  console.error('E2R manifest: no test files found');
  process.exit(1);
}

// ── Execute all in parallel ───────────────────────────────────────────────────
const results = await Promise.all(
  tasks.map(async (t) => {
    const { result, durationMs } = t.unavailable
      ? { result: 'unavailable', durationMs: 0 }
      : await runProcess(t.args, t.timeout);
    return {
      file:       t.rel,
      runner:     t.runner,
      command:    t.args ? t.args.slice(1).join(' ') : 'unavailable',
      filter:     null,
      result,
      durationMs,
    };
  })
);

entries = results.sort((a, b) => a.file.localeCompare(b.file));
writeManifest();
clearTimeout(globalTimer);

// ── Summary ───────────────────────────────────────────────────────────────────
const byRunner = {};
for (const e of entries) {
  if (!byRunner[e.runner]) byRunner[e.runner] = { pass: 0, fail: 0, timeout: 0, unavailable: 0 };
  byRunner[e.runner][e.result] = (byRunner[e.runner][e.result] ?? 0) + 1;
}

const totalPass = entries.filter((e) => e.result === 'pass').length;
console.log(`E2R manifest: ${totalPass}/${entries.length} pass → ${relative(ROOT, OUTPUT)}`);
for (const [runner, counts] of Object.entries(byRunner)) {
  const parts = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`);
  console.log(`  ${runner.padEnd(20)} ${parts.join(' | ')}`);
}

process.exit(0);
