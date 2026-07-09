'use strict';
import { scrubNonCode } from '../../../audit/architecture/scrub_non_code.mjs';

/**
 * metricNestingNormalized — same brace-balance depth counting as
 * metricNesting, but on text scrubbed of comments/strings/templates/
 * regex literals first. A literal brace typed inside a string or a
 * template's static text/interpolation (e.g. Crystal-style "{FieldName}"
 * inside a template literal) is never real code nesting — metricNesting
 * counts it anyway (declared limitation in its own docstring). Report-
 * only capability (RF-SP-HARDENING-NESTING-01): not yet wired into
 * runSaladScore's default pipeline — see the isolated impact measurement
 * before any such wiring.
 */
export function metricNestingNormalized(text) {
  const scrubbed = scrubNonCode(text);
  let depth = 0;
  let max = 0;
  for (const ch of scrubbed) {
    if (ch === '{') {
      depth++;
      if (depth > max) max = depth;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return { value: max, evidence: [] };
}
