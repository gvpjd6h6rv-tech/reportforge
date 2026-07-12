'use strict';
import path from 'node:path';

/** SINGLE owner of "declared path -> the exact path representation the
 *  scanner would report for it": always fixes backslashes to forward
 *  slashes; ADDITIONALLY resolves to an absolute path against `root` when
 *  `root` is supplied (the comparison-with-scanned-paths use case). Without
 *  `root`, returns the slash-fixed RELATIVE form (the duplicate/escape-check
 *  use case, which must inspect the pre-resolution shape -- resolving ".."
 *  away would erase the very escape being detected). Pure, no I/O, no
 *  validation, no rule logic -- the only place this transformation happens. */
export function normalizeSubsystemPath(rawPath, root) {
  const slashed = String(rawPath).replace(/\\/g, '/');
  if (!root) return slashed;
  return path.isAbsolute(slashed) ? slashed : path.resolve(root, slashed);
}
