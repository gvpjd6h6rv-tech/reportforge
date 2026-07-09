'use strict';
import { scrubNonCode } from '../../../audit/architecture/scrub_non_code.mjs';

/** RULE: no physical line may contain more than one top-level statement (real code, not string/comment text, not a for-loop header). */
export function checkNoMultiStatementLine(filePath, text) {
  const lines = scrubNonCode(text).split(/\r?\n/);
  const violations = [];
  let depth = 0;
  lines.forEach((line, idx) => {
    let onLine = 0;
    for (const ch of line) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && depth === 0) onLine += 1;
    }
    if (onLine > 1) violations.push(`${filePath}:L${idx + 1}: ${onLine} statements on one line`);
  });
  return { value: violations.length === 0, evidence: violations };
}
