'use strict';
import { scoreRepo } from '../scoring/score_repo.mjs';
import { buildOwnershipIndex } from '../ownership/ownership_index.mjs';
import { scoreFileResult } from '../scoring/score_file_result.mjs';

export function scoreRepoFiles({ files, rootByFile, ownershipMap, config, baselineScores = {} }) {
  const ownershipIndex = buildOwnershipIndex(ownershipMap);
  const results = [];

  for (const file of files) {
    results.push(scoreFileResult({
      file,
      ownershipIndex,
      root: rootByFile.get(file),
      config,
      baselineScore: baselineScores[file],
    }));
  }

  return { repoScore: scoreRepo(results), files: results };
}
