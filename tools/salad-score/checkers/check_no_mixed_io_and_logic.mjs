'use strict';

/** RULE: a file must not combine fs/fetch I/O with regex/pattern-matching logic in the same file. */
export function checkNoMixedIoAndLogic(filePath, text) {
  const hasIo = /\bfs\.\w+Sync\(|\bfetch\(/.test(text);
  const hasLogic = /\.match\(|\.exec\(|\.test\(/.test(text);
  const pass = !(hasIo && hasLogic);
  return { value: pass, evidence: pass ? [] : [`${filePath}: mixes I/O and pattern-matching logic in one file`] };
}
