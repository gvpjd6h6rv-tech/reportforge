'use strict';
import fs from 'node:fs';
import { collectFileList } from '../collectors/collect_file_list.mjs';
import { scoreRepoFiles } from './score_repo_files.mjs';

/** Pure orchestration: collect files, load ownership map, score repo, aggregate. */
export function runSaladScore({ roots, config, ownershipMapPath, baselineScores = {} }) {
  const fileSet = new Set();
  const fileOrigins = new Map();
  for (const root of roots) {
    for (const f of collectFileList(root, config.excludedDirs)) {
      fileSet.add(f);
      if (!fileOrigins.has(f)) fileOrigins.set(f, root);
    }
  }
  const files = [...fileSet].sort();
  const ownershipMap = JSON.parse(fs.readFileSync(ownershipMapPath, 'utf8'));
  return scoreRepoFiles({ files, rootByFile: fileOrigins, ownershipMap, config, baselineScores });
}
