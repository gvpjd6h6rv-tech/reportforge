'use strict';
import path from 'node:path';

export function normalizeRepoRelativePath(rawPath) {
  const slashed = String(rawPath).replace(/\\/g, '/');
  if (path.isAbsolute(slashed)) {
    throw new Error(`absolute ownership path is not allowed: ${rawPath}`);
  }
  const normalized = path.posix.normalize(slashed);
  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error(`ownership path is empty or invalid: ${rawPath}`);
  }
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`parent traversal is not allowed in ownership path: ${rawPath}`);
  }
  return normalized.replace(/^\.\/+/, '');
}
