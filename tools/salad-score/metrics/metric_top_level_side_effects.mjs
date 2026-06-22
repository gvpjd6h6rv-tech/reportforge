'use strict';

/**
 * Detects side-effecting statements at brace-depth 0 (module top level),
 * outside any function/block — e.g. `window.RF_BUILD_INFO = {...}` at the
 * top of engines/BuildDebugPanel.js (real, confirmed precedent in this
 * repo). Declared approximation: depth tracking is line-based, not AST.
 */
const SIDE_EFFECT_RE = /\bwindow\.\w+\s*=|\bdocument\.\w+\(|\bfetch\(|\.addEventListener\(/;

export function metricTopLevelSideEffects(text) {
  const lines = text.split(/\r?\n/);
  let depth = 0;
  const evidence = [];

  lines.forEach((line, i) => {
    if (depth === 0 && SIDE_EFFECT_RE.test(line)) {
      evidence.push(`L${i + 1}: ${line.trim()}`);
    }
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    depth = Math.max(0, depth + opens - closes);
  });

  return { value: evidence.length, evidence };
}
