'use strict';
import fs from 'node:fs';
import path from 'node:path';

/** Walks a root directory, returns absolute paths of every .js/.mjs file, skipping excludedDirs. */
export function collectFileList(root, excludedDirs = []) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_err) {
      return;
    }
    for (const entry of entries) {
      if (excludedDirs.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
        results.push(full);
      }
    }
  }

  walk(root);
  return results.sort();
}
