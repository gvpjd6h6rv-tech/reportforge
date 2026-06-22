'use strict';

/** RULE: runner/*.mjs must not contain regex matching logic directly — only calls into other layers. */
export function checkRunnerOnlyOrchestration(filePath, text) {
  const violations = [];
  if (/\.match\(|\.exec\(/.test(text)) {
    violations.push(`${filePath}: runner must not contain regex matching logic directly`);
  }
  return { value: violations.length === 0, evidence: violations };
}
