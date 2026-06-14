const DEFAULT_RULE_LIMIT = 30;
const DEFAULT_TEXT_LIMIT = 320;

function getDocumentLike(windowLike) {
  return windowLike?.document || (typeof document !== 'undefined' ? document : null);
}

function getSheetRules(sheet) {
  try {
    return Array.from(sheet?.cssRules || []);
  } catch (_) {
    return [];
  }
}

function splitSelectorList(selectorText = '') {
  return String(selectorText || '').split(',').map((selector) => selector.trim()).filter(Boolean);
}

function selectorMatches(element, selector) {
  try {
    return Boolean(element?.matches?.(selector));
  } catch (_) {
    return false;
  }
}

function getOwnerNodeId(ownerNode) {
  return String(ownerNode?.id || ownerNode?.getAttribute?.('data-owner') || ownerNode?.tagName || '').trim();
}

function truncateText(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function isSafeCssText(text) {
  return !/base64|data:image|blob:/i.test(String(text || ''));
}

function buildRuleEvidence(rule, sheet, textLimit, media = '') {
  const cssText = truncateText(rule.cssText || '', textLimit);
  if (!isSafeCssText(cssText)) return null;
  return {
    selectorText: String(rule.selectorText || ''),
    cssText,
    href: String(sheet?.href || ''),
    ownerNodeId: getOwnerNodeId(sheet?.ownerNode),
    media: String(media || rule.parentRule?.conditionText || sheet?.media?.mediaText || ''),
    source: 'cssom',
    confidence: 'matched-selector',
  };
}

function inspectRule(rule, sheet, element, textLimit, media = '') {
  const selectors = splitSelectorList(rule?.selectorText || '');
  if (!selectors.some((selector) => selectorMatches(element, selector))) return null;
  return buildRuleEvidence(rule, sheet, textLimit, media);
}

function getNestedMedia(parentMedia, rule) {
  return [parentMedia, rule?.conditionText].filter(Boolean).join(' && ');
}

function collectRuleMatches(rule, sheet, element, textLimit, matches, limit, media = '') {
  const evidence = inspectRule(rule, sheet, element, textLimit, media);
  if (evidence) matches.push(evidence);
  if (matches.length >= limit) return;
  for (const nestedRule of getSheetRules(rule)) {
    collectRuleMatches(nestedRule, sheet, element, textLimit, matches, limit, getNestedMedia(media, rule));
    if (matches.length >= limit) return;
  }
}

export function inspectMatchedCssRules(element, windowLike = null, options = {}) {
  const documentLike = getDocumentLike(windowLike);
  if (!documentLike?.styleSheets || !element?.matches) return [];
  const limit = Math.max(1, Number(options.limit || DEFAULT_RULE_LIMIT));
  const textLimit = Math.max(80, Number(options.textLimit || DEFAULT_TEXT_LIMIT));
  const matches = [];
  for (const sheet of Array.from(documentLike.styleSheets || [])) {
    for (const rule of getSheetRules(sheet)) {
      collectRuleMatches(rule, sheet, element, textLimit, matches, limit);
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

export function buildMatchedCssRuleSummary(rules = []) {
  return (Array.isArray(rules) ? rules : []).slice(0, 5).map((rule) => ({
    selectorText: rule.selectorText || '',
    href: rule.href || '',
    ownerNodeId: rule.ownerNodeId || '',
    media: rule.media || '',
  }));
}
