'use strict';
import path from 'node:path';

/** RULE: every declared NON-scoreable file (data/config the scanner never
 *  processes) must resolve to a real owner, matched by CANONICAL
 *  REPOSITORY-RELATIVE PATH -- never basename alone (two files with the
 *  same basename in different directories, e.g. repo-a/package.json vs
 *  fixtures/repo-b/package.json, must never be confused). Normalizes
 *  backslashes, resolves './'/'../' segments, and expresses every declared
 *  path relative to `root` before comparing -- the SAME normalized form the
 *  ownership map's allowedFiles are expected to declare. */
function normalize(root, rawPath) {
  const slashed = String(rawPath).replace(/\\/g, '/');
  const absolute = path.isAbsolute(slashed) ? slashed : path.resolve(root, slashed);
  return path.relative(root, absolute).replace(/\\/g, '/');
}

export function checkNonScoreableOwnership(root, declaredNonScoreableFiles, ownershipMap) {
  const allowed = new Set((ownershipMap.subsystems || []).flatMap((s) => s.allowedFiles || []));
  const unowned = declaredNonScoreableFiles
    .map((f) => normalize(root, f))
    .filter((rel) => !allowed.has(rel));
  return { value: unowned.length === 0, evidence: unowned };
}
