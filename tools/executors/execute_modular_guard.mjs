'use strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Execute a modular guard by dynamically importing its exported function.
 * Returns a normalised result: { id, pass, evidence[], elapsed, error }.
 * Never throws — errors are captured into the result.
 */
export async function executeModularGuard(entry, root = ROOT) {
  const absPath = path.join(root, entry.pathCurrent);
  const t0 = performance.now();
  try {
    const mod = await import(absPath);
    // Convention: the exported function is the only named export.
    const fn = Object.values(mod).find(v => typeof v === 'function');
    if (!fn) throw new Error(`No exported function found in ${entry.pathCurrent}`);
    const result = fn();          // all Oleada-1 guards are synchronous
    const elapsed = Math.round(performance.now() - t0);
    return {
      id: entry.id,
      owner: entry.owner,
      pathCurrent: entry.pathCurrent,
      pass: Boolean(result.value),
      evidence: result.evidence ?? [],
      elapsed,
      error: null,
    };
  } catch (err) {
    return {
      id: entry.id,
      owner: entry.owner,
      pathCurrent: entry.pathCurrent,
      pass: false,
      evidence: [`executor error: ${err.message}`],
      elapsed: Math.round(performance.now() - t0),
      error: err.message,
    };
  }
}
