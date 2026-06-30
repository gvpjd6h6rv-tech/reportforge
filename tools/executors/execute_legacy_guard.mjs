'use strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const execFileAsync = promisify(execFile);

/**
 * Execute a legacy guard as a child process (node audit/<guard>.mjs --report).
 * Captures exit code, stdout, stderr.
 * Returns { id, pass, evidence[], stdout, stderr, elapsed, error }.
 * Never throws.
 */
export async function executeLegacyGuard(entry, root) {
  const absPath = path.join(root, entry.pathCurrent);
  const t0 = performance.now();
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [absPath, '--report'],
      { cwd: root, timeout: 30_000 }
    );
    const elapsed = Math.round(performance.now() - t0);
    return {
      id: entry.id,
      owner: entry.owner,
      pathCurrent: entry.pathCurrent,
      pass: true,
      evidence: [],
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      elapsed,
      error: null,
    };
  } catch (err) {
    // execFile rejects on non-zero exit; err.stdout/stderr are available
    return {
      id: entry.id,
      owner: entry.owner,
      pathCurrent: entry.pathCurrent,
      pass: false,
      evidence: [`exit ${err.code ?? 1}`],
      stdout: (err.stdout ?? '').trim(),
      stderr: (err.stderr ?? '').trim(),
      elapsed: Math.round(performance.now() - t0),
      error: null,  // non-zero exit is expected behavior, not an executor error
    };
  }
}
