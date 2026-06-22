'use strict';
import { metricLoc } from '../metrics/metric_loc.mjs';

/** RULE: a file must not exceed its type's LOC cap. */
export function checkNoGodFile(filePath, text, cap) {
  const { value: loc } = metricLoc(text);
  const pass = loc <= cap;
  return { value: pass, evidence: pass ? [] : [`${filePath}: ${loc} LOC > cap ${cap}`] };
}
