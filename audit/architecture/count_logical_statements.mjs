import { scrubNonCode } from './scrub_non_code.mjs';

const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch']);
const CONTROL_NO_PAREN_KEYWORDS = new Set(['else', 'try', 'do', 'finally']);

function wordEndingAt(text, endExclusive) {
  let start = endExclusive;
  while (start > 0 && /\w/.test(text[start - 1])) start -= 1;
  return text.slice(start, endExclusive);
}

function classifyBlockOpener(scrubbed, bracePos) {
  let j = bracePos - 1;
  while (j >= 0 && /\s/.test(scrubbed[j])) j -= 1;

  if (scrubbed[j] === ')') {
    let depth = 1;
    let k = j - 1;
    while (k >= 0 && depth > 0) {
      if (scrubbed[k] === ')') depth += 1;
      else if (scrubbed[k] === '(') depth -= 1;
      k -= 1;
    }
    let m = k;
    while (m >= 0 && /\s/.test(scrubbed[m])) m -= 1;
    const word = wordEndingAt(scrubbed, m + 1);
    return CONTROL_KEYWORDS.has(word) ? 'control' : 'function';
  }
  if (scrubbed[j] === '>' && scrubbed[j - 1] === '=') return 'function';
  const word = wordEndingAt(scrubbed, j + 1);
  if (CONTROL_NO_PAREN_KEYWORDS.has(word)) return 'control';
  return 'other';
}

/**
 * countLogicalStatements — approximates how many lines a standard
 * formatter would use.
 *
 * Counts statement-terminating `;` at parenthesis-depth 0 (excludes a
 * for-loop's own `for(a;b;c)` semicolons — depth 1 inside the for's
 * parens), PLUS a per-block adjustment:
 *   - a CONTROL block (if/for/while/switch/catch/else/try/do/finally)
 *     always adds +2 (open+close) — control flow is always written across
 *     multiple lines by convention, regardless of how many statements it
 *     wraps, even a single one.
 *   - a FUNCTION block (anything else opened by `)  {` or `=> {`, never
 *     an object/array literal) adds +2 ONLY when it wraps MORE THAN ONE
 *     real statement — a single-expression facade method
 *     (`m() { return other.m(...); }`) is legitimately one line and must
 *     not be penalized just for existing as a block.
 *   - an object/array literal brace (`{` not preceded by `)`/`=>`/a
 *     control keyword) never adds anything — it is data, not code.
 *
 * Declared approximation, not a real AST: multi-property object/array
 * literals squeezed onto one line (comma-separated, no `;`, no block
 * opener) are NOT compensated by this metric — known limitation, same
 * spirit as this repo's other regex-based metrics (metricComplexity,
 * metricNesting) rather than silently pretending completeness.
 */
export function countLogicalStatements(text) {
  const scrubbed = scrubNonCode(text);
  let parenDepth = 0;
  let total = 0;
  const stack = [];

  for (let i = 0; i < scrubbed.length; i += 1) {
    const ch = scrubbed[i];
    if (ch === '(') { parenDepth += 1; continue; }
    if (ch === ')') { parenDepth = Math.max(0, parenDepth - 1); continue; }
    if (ch === ';' && parenDepth === 0) {
      total += 1;
      if (stack.length) stack[stack.length - 1].semis += 1;
      continue;
    }
    if (ch === '{') {
      stack.push({ kind: classifyBlockOpener(scrubbed, i), semis: 0 });
      continue;
    }
    if (ch === '}') {
      const frame = stack.pop();
      if (frame && (frame.kind === 'control' || (frame.kind === 'function' && frame.semis > 1))) {
        total += 2;
      }
    }
  }

  return total;
}
