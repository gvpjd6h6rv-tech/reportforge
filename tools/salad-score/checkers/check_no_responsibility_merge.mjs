'use strict';
import { metricResponsibilities } from '../metrics/metric_responsibilities.mjs';

const FORBIDDEN_FOR_MAP = ['io', 'dom-mutation', 'event-wiring', 'state-mutation'];

/** RULE: a *Map.js file (data-transform contract — see check_map_data_only.mjs's JSON analogue) must never contain fetch/DOM/event-wiring/state-mutation. */
export function checkNoResponsibilityMerge(filePath, text) {
  if (!/Map\.(js|mjs)$/.test(filePath)) return { value: true, evidence: [] };
  const { value: categories } = metricResponsibilities(text);
  const hits = categories.filter((c) => FORBIDDEN_FOR_MAP.includes(c));
  return {
    value: hits.length === 0,
    evidence: hits.length ? [`${filePath}: *Map.js mixes forbidden responsibilities: ${hits.join(', ')}`] : [],
  };
}
