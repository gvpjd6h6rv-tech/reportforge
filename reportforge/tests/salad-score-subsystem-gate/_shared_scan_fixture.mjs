'use strict';
import { runSaladScore } from '../../../tools/salad-score/runner/run_salad_score.mjs';
import path from 'node:path';

/** Test-only fixture helper: runs the OFFICIAL scanner once over a given
 *  materialized root and returns its per-file results, optionally filtered
 *  down to the declared relative paths (join+filter done here so callers
 *  don't need their own nested filter). No assertions, no product rules. */
export function scanFixtureRoot(root, config, ownershipMapPath, declaredRelativePaths) {
  const files = runSaladScore({ roots: [root], config, ownershipMapPath }).files;
  if (!declaredRelativePaths) return files;
  const declared = declaredRelativePaths.map((p) => path.resolve(root, p));
  return files.filter((f) => declared.includes(f.path));
}
