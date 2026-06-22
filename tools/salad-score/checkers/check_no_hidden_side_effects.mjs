'use strict';

/** RULE: metrics/scoring/contracts/checkers/normalizers files must not contain fs/fetch/console calls — only collectors/reporters/bin may. */
export function checkNoHiddenSideEffects(filePath, text) {
  const violations = [];
  if (/\bfs\.\w+Sync\(|\bfetch\(|\bconsole\.\w+\(/.test(text)) {
    violations.push(`${filePath}: contains I/O or console call outside collectors/reporters/bin`);
  }
  return { value: violations.length === 0, evidence: violations };
}
