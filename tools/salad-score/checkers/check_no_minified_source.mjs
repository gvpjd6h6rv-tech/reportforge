'use strict';

const LONG_LINE_THRESHOLD = 200;
const SUSPECT_PROPORTION = 0.3;
const MIN_LINES = 5;

/** RULE: flags files whose PROPORTION of very-long lines suggests real minification — never a single legitimate long line. */
export function checkNoMinifiedSource(filePath, text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < MIN_LINES) return { value: true, evidence: [] };

  const longLines = lines.filter((l) => l.length > LONG_LINE_THRESHOLD);
  const proportion = longLines.length / lines.length;
  const pass = proportion <= SUSPECT_PROPORTION;
  return {
    value: pass,
    evidence: pass ? [] : [`${filePath}: ${longLines.length}/${lines.length} lines (${Math.round(proportion * 100)}%) exceed ${LONG_LINE_THRESHOLD} chars`],
  };
}
