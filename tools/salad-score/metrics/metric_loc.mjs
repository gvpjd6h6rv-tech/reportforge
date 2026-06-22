'use strict';
import { countLines } from '../../../audit/architecture/count_lines.mjs';

/** Reuses the existing real RF primitive — does not duplicate the LOC count. */
export function metricLoc(text) {
  return { value: countLines(text), evidence: [] };
}
