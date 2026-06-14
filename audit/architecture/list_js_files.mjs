import fs from 'node:fs';
import path from 'node:path';

export function listJsFiles(rootPath) {
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) return [rootPath];

  return fs.readdirSync(rootPath)
    .filter((name) => name.endsWith('.js') || name.endsWith('.mjs'))
    .map((name) => path.join(rootPath, name));
}
