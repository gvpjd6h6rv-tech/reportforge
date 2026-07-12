'use strict';
/** RULE: no (already-normalized) declared path may escape root via "..".
 *  Does not normalize -- see normalize_subsystem_path.mjs. */
export function checkNoScopePathEscape(normalizedPaths) {
  const escapes = normalizedPaths.filter((p) => p.split('/').includes('..'));
  return { value: escapes.length === 0, evidence: escapes };
}
