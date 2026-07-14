'use strict';
export function checkBfsMapDrift({ bfsCandidates = [], reviewedBfsCandidates = [] } = {}) {
  const normalize = (candidate) => String(candidate?.path || candidate?.id || candidate?.from || candidate?.to || '').replace(/\\/g, '/');
  const bfsKeys = new Set(bfsCandidates.map(normalize).filter(Boolean));
  const violations = [
    ...bfsCandidates.filter((candidate) => candidate && typeof candidate.reviewDecision !== 'string' || candidate?.reviewDecision && !String(candidate.reviewDecision).startsWith('REVIEWED_')).map((candidate) => ({ code: 'BFS_UNREVIEWED_CANDIDATE', key: normalize(candidate), candidate })),
    ...reviewedBfsCandidates.filter((candidate) => normalize(candidate) && (!bfsKeys.has(normalize(candidate)) || typeof candidate?.reviewDecision !== 'string' || !candidate.reviewDecision.startsWith('REVIEWED_'))).map((candidate) => (!bfsKeys.has(normalize(candidate)) ? { code: 'BFS_REVIEWED_CANDIDATE_MISSING', key: normalize(candidate), candidate } : { code: 'BFS_REVIEWED_DECISION_INVALID', key: normalize(candidate), candidate })),
  ];
  return { name: 'check_bfs_map_drift', value: violations.length === 0, evidence: { violations, bfsCandidates: bfsKeys.size, reviewedBfsCandidates: reviewedBfsCandidates.length }, diagnostics: violations };
}
