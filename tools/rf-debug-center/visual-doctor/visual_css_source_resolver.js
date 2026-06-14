function splitSelectorList(selectorText = '') {
  return String(selectorText || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function stripCommentsPreserveLines(cssText = '') {
  return String(cssText || '').replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
}

function lineColumnAt(text = '', index = 0) {
  const lines = String(text || '').slice(0, index).split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function findSelectorStart(cssText = '', braceIndex = 0) {
  const before = cssText.slice(0, braceIndex);
  return Math.max(before.lastIndexOf('}'), before.lastIndexOf('{')) + 1;
}

function declarationsForBlock(block = '') {
  return String(block || '').split(';').map((part) => part.split(':')[0]?.trim()).filter(Boolean);
}

function parseCssTextEntry(entry = {}) {
  const cssText = stripCommentsPreserveLines(entry.cssText || '');
  const entries = [];
  for (let index = 0; index < cssText.length; index += 1) {
    if (cssText[index] !== '{') continue;
    const start = findSelectorStart(cssText, index);
    const selectorText = cssText.slice(start, index).trim();
    if (!selectorText || selectorText.startsWith('@')) continue;
    const end = cssText.indexOf('}', index + 1);
    const offset = cssText.slice(start, index).search(/\S/);
    const location = lineColumnAt(cssText, start + Math.max(offset, 0));
    entries.push({ file: entry.file || '', href: entry.href || '', line: location.line, column: location.column, selectorText, declarations: declarationsForBlock(cssText.slice(index + 1, end > -1 ? end : cssText.length)) });
  }
  return entries;
}

function normalizeEntry(entry = {}) {
  return { file: entry.file || '', href: entry.href || '', line: Number(entry.line || 0), column: Number(entry.column || 0), selectorText: entry.selectorText || '', selectors: splitSelectorList(entry.selectorText), declarations: Array.isArray(entry.declarations) ? entry.declarations : [] };
}

export function buildCssSourceIndexFromEntries(entries = [], options = {}) {
  const expanded = (Array.isArray(entries) ? entries : []).flatMap((entry) => entry?.cssText ? parseCssTextEntry(entry) : [entry]);
  return expanded.map(normalizeEntry).filter((entry) => (entry.file || entry.href) && entry.selectorText).slice(0, options.limit || 5000);
}

export function buildCssSourceIndexFromCssText(file, cssText = '', options = {}) {
  return buildCssSourceIndexFromEntries([{ file, cssText, href: options.href || '' }], options);
}

export function resolveCssSourceHints(selectorText = '', sourceIndex = [], options = {}) {
  const selectors = splitSelectorList(selectorText);
  const seen = new Set();
  const hints = buildCssSourceIndexFromEntries(sourceIndex, options).filter((entry) => selectors.some((item) => entry.selectors.includes(item) || entry.selectorText === item)).map((entry) => ({ file: entry.file, href: entry.href, line: entry.line, column: entry.column, selectorText: entry.selectorText, declarations: entry.declarations, confidence: entry.file ? 'exact-selector' : 'LOW' })).filter((hint) => {
    const key = `${hint.file}:${hint.href}:${hint.line}:${hint.column}:${hint.selectorText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { selectorText, hints: hints.slice(0, options.limit || 10), limitations: ['line and column are from a static source index, not CSSOM'] };
}

export function summarizeCssSourceHints(hints = {}) {
  const items = Array.isArray(hints.hints) ? hints.hints : [];
  return items.length ? items.slice(0, 5).map((hint) => `${hint.file || hint.href}:${hint.line || 0}:${hint.column || 0} ${hint.selectorText}`).join(' | ') : 'No source hints';
}
