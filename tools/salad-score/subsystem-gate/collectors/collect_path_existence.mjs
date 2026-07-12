'use strict';
import fs from 'node:fs';
import path from 'node:path';

/** I/O collector: given a root and a list of relative paths, returns which
 *  of them exist on disk. No rule logic -- pure fact-gathering, mirroring
 *  collect_file_list.mjs's own I/O-owner role. */
export function collectPathExistence(root, relativePaths) {
  return Object.fromEntries(relativePaths.map((p) => [p, fs.existsSync(path.resolve(root, p))]));
}
