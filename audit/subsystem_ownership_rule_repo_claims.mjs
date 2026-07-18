'use strict';
import { normalizeRepoRelativePath } from '../tools/salad-score/ownership/ownership_paths.mjs';

export function collectRepoPathClaims(subsystems) {
  const claims = [];
  const errors = [];

  for (const ss of subsystems) {
    for (const raw of (ss.allowedPaths || [])) {
      try {
        claims.push({ subsystem: ss.id, raw, rel: normalizeRepoRelativePath(raw) });
      } catch (err) {
        errors.push({ rule: 'RULE-EXIST', subsystem: ss.id, file: raw, detail: err.message });
      }
    }
  }

  return { claims, errors };
}
