/**
 * scrubNonCode — replaces the contents of comments, string/template
 * literals, and regex literals with neutral space characters, keeping
 * every other character (including all structural punctuation: `;`, `(`,
 * `)`, `{`, `}`) exactly in place — same length, same line breaks.
 *
 * Rationale: a syntactically valid statement-terminating `;` or a real
 * paren/brace can never occur INSIDE a string/comment/regex/template
 * body — only inside actual code. Scrubbing those bodies down to spaces
 * before counting structural punctuation is therefore always safe: it
 * never turns a real `;` into a fake one, and it never lets a `;` typed
 * inside a comment or a "a;b;c" string masquerade as three statements.
 *
 * Declared approximation (consistent with this repo's other regex-based
 * metrics, e.g. metricNesting/metricComplexity): no real AST parser is
 * installed. Regex-vs-division disambiguation uses the same heuristic
 * common to lightweight tokenizers (previous significant character
 * decides). A backtick template literal nested inside another template's
 * `${...}` can prematurely end the outer scrub state — rare in this
 * codebase's actual style (no nested template literals observed), not
 * silently assumed away.
 */
const REGEX_PRECEDING_CHARS = /[([{,;:=&|!?+\-*%^~<>]/;

export function scrubNonCode(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let state = 'normal';
  let prevSignificant = '';

  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : '';

    if (state === 'normal') {
      if (ch === '/' && next === '/') { state = 'line-comment'; out += '  '; i += 2; continue; }
      if (ch === '/' && next === '*') { state = 'block-comment'; out += '  '; i += 2; continue; }
      if (ch === "'") { state = 'sq'; out += ' '; i += 1; continue; }
      if (ch === '"') { state = 'dq'; out += ' '; i += 1; continue; }
      if (ch === '`') { state = 'template'; out += ' '; i += 1; continue; }
      if (ch === '/' && REGEX_PRECEDING_CHARS.test(prevSignificant || '^')) {
        state = 'regex'; out += ' '; i += 1; continue;
      }
      out += ch;
      if (!/\s/.test(ch)) prevSignificant = ch;
      i += 1;
      continue;
    }

    if (state === 'line-comment') {
      if (ch === '\n') { state = 'normal'; out += '\n'; i += 1; continue; }
      out += ' '; i += 1; continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') { state = 'normal'; out += '  '; i += 2; continue; }
      out += ch === '\n' ? '\n' : ' '; i += 1; continue;
    }

    if (state === 'sq' || state === 'dq') {
      if (ch === '\\') { out += '  '; i += 2; continue; }
      if ((state === 'sq' && ch === "'") || (state === 'dq' && ch === '"')) { state = 'normal'; out += ' '; i += 1; continue; }
      out += ' '; i += 1; continue;
    }

    if (state === 'template') {
      if (ch === '\\') { out += '  '; i += 2; continue; }
      if (ch === '`') { state = 'normal'; out += ' '; i += 1; continue; }
      out += ch === '\n' ? '\n' : ' '; i += 1; continue;
    }

    if (state === 'regex') {
      if (ch === '\\') { out += '  '; i += 2; continue; }
      if (ch === '/') {
        state = 'normal'; out += ' '; i += 1;
        while (i < n && /[a-z]/i.test(text[i])) { out += ' '; i += 1; }
        continue;
      }
      out += ch === '\n' ? '\n' : ' '; i += 1; continue;
    }

    // Unreachable for any known state — advance defensively rather than loop forever.
    out += ch; i += 1;
  }

  return out;
}
