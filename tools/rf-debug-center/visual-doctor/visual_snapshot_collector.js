import { stableSelector } from './visual_selector_resolver.js';

const STYLE_KEYS = [
  'display',
  'visibility',
  'position',
  'zIndex',
  'overflow',
  'overflowX',
  'overflowY',
  'contain',
  'clipPath',
  'maskImage',
  'webkitMaskImage',
  'transform',
  'filter',
  'backdropFilter',
  'opacity',
  'isolation',
  'pointerEvents',
  'mixBlendMode',
  'whiteSpace',
  'textOverflow',
  'lineHeight',
  'fontSize',
  'fontWeight',
  'tableLayout',
  'verticalAlign',
  'top',
  'left',
  'right',
  'bottom',
  'height',
  'minHeight',
  'maxHeight',
  'width',
  'minWidth',
  'maxWidth',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderRadius',
  'boxSizing',
  'boxShadow',
  'alignItems',
  'appearance',
];

function n(value) {
  return Number.isFinite(value) ? value : 0;
}

function rectSnapshot(el) {
  if (!el?.getBoundingClientRect) return null;
  const rect = el.getBoundingClientRect();
  return {
    left: n(rect.left),
    top: n(rect.top),
    right: n(rect.right),
    bottom: n(rect.bottom),
    width: n(rect.width),
    height: n(rect.height),
  };
}

function pickStyles(style, keys = STYLE_KEYS) {
  const out = {};
  for (const key of keys) out[key] = style?.[key] ?? '';
  return out;
}

function visibleText(el) {
  return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
}

function elementSection(el) {
  const section = el?.closest?.('thead, tbody, tfoot');
  return section?.tagName?.toLowerCase() || '';
}

function numericProp(value, fallback = -1) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function datasetSnapshot(el) {
  return { ...(el?.dataset || {}) };
}

function pseudoSnapshot(win, el, pseudo) {
  try {
    return pickStyles(win.getComputedStyle(el, pseudo), [
      'content',
      'display',
      'position',
      'width',
      'height',
      'backgroundColor',
      'boxShadow',
      'filter',
      'borderRadius',
      'opacity',
    ]);
  } catch (_) {
    return null;
  }
}

function shouldCapturePseudoElements(env = {}) {
  return env.capturePseudoElements === true;
}

function buildPseudoSnapshots(win, el, capturePseudoElements) {
  if (!capturePseudoElements) {
    return { before: null, after: null };
  }
  return {
    before: pseudoSnapshot(win, el, '::before'),
    after: pseudoSnapshot(win, el, '::after'),
  };
}

function buildVisualSnapshot(win, el, capturePseudoElements) {
  return {
    selector: stableSelector(el),
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    className: String(el.className || ''),
    childElementCount: Number(el.childElementCount || 0),
    role: el.getAttribute?.('role') || '',
    type: String(el.getAttribute?.('type') || ''),
    tabIndex: Number(el.tabIndex ?? -1),
    disabled: Boolean(el.disabled),
    ariaHidden: String(el.getAttribute?.('aria-hidden') || ''),
    dataset: datasetSnapshot(el),
    tableSection: elementSection(el),
    rowIndex: numericProp(el.rowIndex, numericProp(el.closest?.('tr')?.rowIndex)),
    cellIndex: numericProp(el.cellIndex, numericProp(el.closest?.('td, th')?.cellIndex)),
    colSpan: numericProp(el.colSpan, 1),
    rowSpan: numericProp(el.rowSpan, 1),
    offsetParentSelector: el.offsetParent ? stableSelector(el.offsetParent) : '',
    text: visibleText(el),
    rect: rectSnapshot(el),
    metrics: {
      clientWidth: n(el.clientWidth),
      clientHeight: n(el.clientHeight),
      scrollWidth: n(el.scrollWidth),
      scrollHeight: n(el.scrollHeight),
      scrollLeft: n(el.scrollLeft),
      scrollTop: n(el.scrollTop),
      offsetWidth: n(el.offsetWidth),
      offsetHeight: n(el.offsetHeight),
    },
    styles: pickStyles(win.getComputedStyle(el)),
    pseudo: buildPseudoSnapshots(win, el, capturePseudoElements),
    parents: collectParentChain(win, el),
    viewport: {
      width: n(win.innerWidth),
      height: n(win.innerHeight),
      devicePixelRatio: n(win.devicePixelRatio || 1),
    },
    screenshot: { supported: false, crop: null },
  };
}

function collectParentChain(win, el) {
  const chain = [];
  let current = el?.parentElement || null;
  while (current && current !== win.document.documentElement) {
    chain.push({
      selector: stableSelector(current),
      tagName: current.tagName.toLowerCase(),
      id: current.id || '',
    className: String(current.className || ''),
      rect: rectSnapshot(current),
      styles: pickStyles(win.getComputedStyle(current), [
        'display',
        'visibility',
        'position',
        'zIndex',
        'overflow',
        'overflowX',
        'overflowY',
        'contain',
        'clipPath',
        'maskImage',
        'webkitMaskImage',
        'transform',
        'filter',
        'backdropFilter',
        'opacity',
        'isolation',
        'pointerEvents',
        'mixBlendMode',
        'whiteSpace',
        'textOverflow',
      ]),
    });
    current = current.parentElement;
  }
  return chain;
}

export function collectVisualSnapshots(env = {}, selectors = []) {
  const win = env.window || window;
  const doc = win.document;
  const capturePseudoElements = shouldCapturePseudoElements(env);
  const nodes = Array.from(new Set(selectors)).flatMap((selector) => Array.from(doc.querySelectorAll(selector)));
  return nodes.map((el) => buildVisualSnapshot(win, el, capturePseudoElements));
}
