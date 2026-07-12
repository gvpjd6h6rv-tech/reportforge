'use strict';
import path from 'node:path';

function normalizeRelative(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function resolveCanonicalPaths(root, relativePaths = []) {
  const base = path.resolve(root || '.');
  const list = Array.isArray(relativePaths) ? relativePaths : [];
  return list.map((relative) => {
    const rel = normalizeRelative(relative);
    const absolute = path.resolve(base, rel);
    const withinRoot = absolute === base || absolute.startsWith(`${base}${path.sep}`);
    return { relative: rel, absolute, withinRoot };
  });
}
