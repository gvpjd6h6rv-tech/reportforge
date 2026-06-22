'use strict';

/** RULE: bin/*.mjs (the CLI) must not contain metric/regex computation logic — only argv/stdout/exit I/O. */
export function checkCliIoOnly(filePath, text) {
  const violations = [];
  if (/\.match\(|\.exec\(/.test(text)) {
    violations.push(`${filePath}: CLI must not contain metric/regex logic`);
  }
  return { value: violations.length === 0, evidence: violations };
}
