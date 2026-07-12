'use strict';
import fs from 'node:fs';
import path from 'node:path';
export function collectSpScores(resultOrPath, root = process.cwd()) {
  const payload = typeof resultOrPath === 'string' ? JSON.parse(fs.readFileSync(path.resolve(root, resultOrPath), 'utf8')) : resultOrPath || {};
  const files = (payload.files || payload.results || payload.scoreFiles || payload.subsystems?.flatMap((subsystem) => subsystem.files || []) || []).map((file) => ({
    path: String(file.path).replace(/\\/g, '/'),
    spTotalScore: file.sp_total_score ?? file.spTotalScore ?? 0,
  }));
  return { files, byPath: Object.fromEntries(files.map((file) => [file.path, file.spTotalScore])) };
}
