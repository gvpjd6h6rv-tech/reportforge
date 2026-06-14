export function stableSelector(el) {
  if (!el) return 'unknown';
  if (el.id) return `#${el.id}`;
  const attr = el.getAttribute?.('data-testid')
    || el.getAttribute?.('data-role')
    || el.getAttribute?.('data-bind');
  if (attr) return `${el.tagName.toLowerCase()}[data-bind="${attr}"]`;
  const classes = String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
}
