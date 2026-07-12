'use strict';
import fs from 'node:fs';
import path from 'node:path';
export function collectPhysicalScope(root, config) {
  const scanRoots = Array.isArray(config?.scanRoots) ? config.scanRoots : ['engines'];
  const excluded = new Set(Array.isArray(config?.excludedDirs) ? config.excludedDirs : []);
  const files = [];
  for (const scanRoot of scanRoots) {
    const absRoot = path.resolve(root, scanRoot);
    walk(absRoot);
  }
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push({ absolute: abs, relative: path.relative(root, abs).split(path.sep).join('/') });
      }
    }
  }
  files.sort((a, b) => a.relative.localeCompare(b.relative));
  return files;
}
