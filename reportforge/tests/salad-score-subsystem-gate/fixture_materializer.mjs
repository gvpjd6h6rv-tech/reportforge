'use strict';
import realFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Neutral fixture lifecycle harness: receives an already-assembled
 *  {files, scopeMap, ownershipMap} descriptor (callers load actual scenario
 *  content from scenario-data/scenarios.json -- this module has ZERO
 *  knowledge of scenario semantics). Sole responsibility: materialize +
 *  guaranteed cleanup.
 *
 *  Error precedence contract (only one error ever propagates):
 *    1. SETUP error (mkdir/writeFile during materialization) -- the
 *       callback NEVER runs; propagates immediately, cleanup is attempted
 *       on whatever partial state exists.
 *    2. CALLBACK error -- if setup succeeded but the callback throws, its
 *       error takes precedence over any later cleanup error.
 *    3. CLEANUP error -- only propagates on its own if setup and callback
 *       both succeeded.
 *  A lower-precedence error occurring alongside a higher one is attached as
 *  `.cleanupError` (never silently swallowed).
 *
 *  `fsAdapter` (optional, defaults to the real `fs` module) lets tests
 *  inject a controlled I/O fault at a specific step without relying on
 *  fragile real OS permissions. */
export async function withMaterializedFixture({ files, scopeMap, ownershipMap }, fn, fsAdapter = realFs) {
  const root = fsAdapter.mkdtempSync(path.join(os.tmpdir(), 'sss-gate-fixture-'));
  for (const file of files) {
    const full = path.join(root, file.relPath);
    fsAdapter.mkdirSync(path.dirname(full), { recursive: true });
    fsAdapter.writeFileSync(full, file.content);
  }
  fsAdapter.mkdirSync(path.join(root, 'audit'), { recursive: true });
  fsAdapter.writeFileSync(path.join(root, 'audit/subsystem_scope_map.json'), JSON.stringify(scopeMap, null, 2));
  fsAdapter.writeFileSync(path.join(root, 'audit/subsystem_ownership_map.json'), JSON.stringify(ownershipMap, null, 2));

  let callbackError = null;
  let out;
  try {
    out = await fn(root);
  } catch (err) {
    callbackError = err;
  }
  try {
    realFs.rmSync(root, { recursive: true, force: false });
    if (realFs.existsSync(root)) throw new Error(`FIXTURE_CLEANUP_FAILED: ${root} still exists`);
  } catch (cleanupErr) {
    if (callbackError) { callbackError.cleanupError = cleanupErr; throw callbackError; }
    throw cleanupErr;
  }
  if (callbackError) throw callbackError;
  return out;
}
