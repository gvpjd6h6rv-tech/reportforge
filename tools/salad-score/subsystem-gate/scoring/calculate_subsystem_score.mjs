'use strict';
import { scoreRepo } from '../../scoring/score_repo.mjs';

/** SP_SUBSYSTEM_SCORE = the OFFICIAL scoreRepo(scopedResults) — same formula,
 *  same function, applied to the subsystem's own scoped subset instead of
 *  the whole repo. Guards the empty-scope case BEFORE calling scoreRepo,
 *  because scoreRepo([]) === 0, which would otherwise read as a false green. */
export function calculateSubsystemScore(scopedResults) {
  if (!scopedResults || scopedResults.length === 0) {
    throw new Error('SUBSYSTEM_SCOPE_RESULT_EMPTY: cannot score an empty scoped set');
  }
  return scoreRepo(scopedResults);
}
