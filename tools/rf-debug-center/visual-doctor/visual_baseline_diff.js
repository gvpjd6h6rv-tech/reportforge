const BASELINE_STYLE_KEYS = [
  'display',
  'visibility',
  'opacity',
  'overflowX',
  'overflowY',
  'contain',
  'position',
  'zIndex',
  'transform',
  'filter',
  'pointerEvents',
  'boxSizing',
  'lineHeight',
  'fontSize',
  'paddingTop',
  'paddingBottom',
  'minHeight',
  'maxHeight',
  'backgroundImage',
  'appearance',
];

const RECT_KEYS = ['left', 'top', 'width', 'height'];
const IGNORE_TOKENS = ['debug', 'dc-', 'tooltip', 'popover', 'modal-closed'];
const INTERACTIVE_TAGS = new Set(['input', 'select', 'textarea', 'button', 'a']);
const CLIPPING_VALUES = new Set(['hidden', 'clip', 'auto', 'scroll']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function visibleRect(snapshot) {
  return Boolean(snapshot?.rect && snapshot.rect.width > 0 && snapshot.rect.height > 0);
}

function interactive(snapshot) {
  return INTERACTIVE_TAGS.has(snapshot.tagName) || snapshot.tabIndex >= 0 || snapshot.role === 'button' || snapshot.role === 'link';
}

function ignored(snapshot) {
  const haystack = `${snapshot.selector} ${snapshot.className}`.toLowerCase();
  return IGNORE_TOKENS.some((token) => haystack.includes(token));
}

function pickStyles(styles = {}) {
  return Object.fromEntries(BASELINE_STYLE_KEYS.map((key) => [key, styles[key] ?? '']));
}

function pickRect(rect = null) {
  if (!rect) return null;
  return {
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function baselineEntry(snapshot) {
  return {
    selector: snapshot.selector,
    tagName: snapshot.tagName,
    id: snapshot.id,
    className: snapshot.className,
    role: snapshot.role || '',
    tabIndex: snapshot.tabIndex ?? -1,
    rect: pickRect(snapshot.rect),
    styles: pickStyles(snapshot.styles),
    table: {
      tableSection: snapshot.tableSection || '',
      rowIndex: snapshot.rowIndex ?? -1,
      cellIndex: snapshot.cellIndex ?? -1,
      colSpan: snapshot.colSpan ?? 1,
      rowSpan: snapshot.rowSpan ?? 1,
    },
  };
}

export function buildVisualBaseline(snapshots = [], options = {}) {
  const entries = snapshots
    .filter((snapshot) => snapshot?.selector && !ignored(snapshot))
    .filter((snapshot) => options.includeZeroRect ? true : visibleRect(snapshot) || interactive(snapshot))
    .map(baselineEntry);
  return {
    version: 1,
    generatedAt: options.generatedAt || 'test',
    entries,
  };
}

function toCurrentEntry(snapshot) {
  return baselineEntry(snapshot);
}

function rectDelta(baselineRect, currentRect) {
  if (!baselineRect || !currentRect) return { changedKeys: [], deltas: {} };
  const deltas = Object.fromEntries(
    RECT_KEYS.map((key) => [key, round((currentRect[key] || 0) - (baselineRect[key] || 0))]),
  );
  const changedKeys = RECT_KEYS.filter((key) => Math.abs(deltas[key]) > 0.01);
  return { changedKeys, deltas };
}

function styleChanges(baselineStyles = {}, currentStyles = {}) {
  return BASELINE_STYLE_KEYS.filter((key) => (baselineStyles[key] ?? '') !== (currentStyles[key] ?? ''));
}

function clippingRaised(styleKey, baselineValue, currentValue) {
  if (!['overflowX', 'overflowY', 'contain'].includes(styleKey)) return false;
  const before = normalized(baselineValue);
  const after = normalized(currentValue);
  if (styleKey === 'contain') return !before.includes('paint') && after.includes('paint');
  return !CLIPPING_VALUES.has(before) && CLIPPING_VALUES.has(after);
}

function criticalStyleRootCause(entry, changedKeys) {
  return changedKeys.some((key) => {
    const value = normalized(entry.styles[key]);
    return (
      (interactive(entry) && ['display', 'visibility', 'opacity', 'pointerEvents'].includes(key))
      || clippingRaised(key, '', value)
    );
  });
}

function severityForChangedEntry(baselineEntryValue, currentEntryValue, rectInfo, styleKeys) {
  const leftTopMax = Math.max(Math.abs(rectInfo.deltas.left || 0), Math.abs(rectInfo.deltas.top || 0));
  const sizeMax = Math.max(Math.abs(rectInfo.deltas.width || 0), Math.abs(rectInfo.deltas.height || 0));
  const rootGeometry = leftTopMax >= 8 || sizeMax >= 8;
  const candidateGeometry = leftTopMax >= 4 || sizeMax >= 4;
  const rootStyle = styleKeys.some((key) => {
    const before = baselineEntryValue.styles[key];
    const after = currentEntryValue.styles[key];
    return (
      (interactive(currentEntryValue) && ['display', 'visibility', 'opacity', 'pointerEvents'].includes(key))
      || clippingRaised(key, before, after)
    );
  });
  if (rootGeometry || rootStyle) return 'ROOT_CAUSE';
  if (candidateGeometry || styleKeys.length) return 'CANDIDATE';
  return 'BACKLOG';
}

function changedFinding(baselineValue, currentValue) {
  const rectInfo = rectDelta(baselineValue.rect, currentValue.rect);
  const changedStyleKeys = styleChanges(baselineValue.styles, currentValue.styles);
  const changedKeys = [...rectInfo.changedKeys, ...changedStyleKeys];
  const severity = severityForChangedEntry(baselineValue, currentValue, rectInfo, changedStyleKeys);
  if (!changedKeys.length) return null;
  return {
    type: 'VISUAL_BASELINE_DIFF',
    severity,
    affectedElement: currentValue.selector,
    affectedLabel: currentValue.id || currentValue.selector,
    evidence: {
      baselineValue,
      currentValue,
      deltaPx: rectInfo.deltas,
      deltaPct: {
        width: baselineValue.rect?.width ? round((rectInfo.deltas.width / baselineValue.rect.width) * 100) : 0,
        height: baselineValue.rect?.height ? round((rectInfo.deltas.height / baselineValue.rect.height) * 100) : 0,
      },
      changedKeys,
      missingFromCurrent: false,
      newInCurrent: false,
    },
  };
}

function missingFinding(baselineValue) {
  return {
    type: 'VISUAL_BASELINE_DIFF',
    severity: interactive(baselineValue) ? 'ROOT_CAUSE' : 'CANDIDATE',
    affectedElement: baselineValue.selector,
    affectedLabel: baselineValue.id || baselineValue.selector,
    evidence: {
      baselineValue,
      currentValue: null,
      deltaPx: null,
      deltaPct: null,
      changedKeys: [],
      missingFromCurrent: true,
      newInCurrent: false,
    },
  };
}

function newFinding(currentValue) {
  return {
    type: 'VISUAL_BASELINE_DIFF',
    severity: interactive(currentValue) || normalized(currentValue.styles.position) === 'fixed' ? 'CANDIDATE' : 'BACKLOG',
    affectedElement: currentValue.selector,
    affectedLabel: currentValue.id || currentValue.selector,
    evidence: {
      baselineValue: null,
      currentValue,
      deltaPx: null,
      deltaPct: null,
      changedKeys: [],
      missingFromCurrent: false,
      newInCurrent: true,
    },
  };
}

export function diffVisualBaseline(baseline, currentSnapshots = [], options = {}) {
  const baselineEntries = new Map((baseline?.entries || []).map((entry) => [entry.selector, entry]));
  const currentEntries = new Map(
    currentSnapshots
      .filter((snapshot) => snapshot?.selector && !ignored(snapshot))
      .map((snapshot) => [snapshot.selector, toCurrentEntry(snapshot)]),
  );
  const findings = [];

  for (const [selector, baselineEntryValue] of baselineEntries.entries()) {
    const currentValue = currentEntries.get(selector);
    if (!currentValue) {
      findings.push(missingFinding(baselineEntryValue));
      continue;
    }
    const finding = changedFinding(baselineEntryValue, currentValue);
    if (finding) findings.push(finding);
  }

  for (const [selector, currentValue] of currentEntries.entries()) {
    if (baselineEntries.has(selector)) continue;
    findings.push(newFinding(currentValue));
  }

  return {
    key: options.key || 'visual-baseline-diff',
    title: options.title || 'Visual baseline diff',
    kind: 'baseline',
    snapshots: currentSnapshots,
    findings,
  };
}

export function summarizeBaselineDiff(diff) {
  const findings = diff?.findings || [];
  return {
    total: findings.length,
    rootCause: findings.filter((finding) => finding.severity === 'ROOT_CAUSE').length,
    candidate: findings.filter((finding) => finding.severity === 'CANDIDATE').length,
    backlog: findings.filter((finding) => finding.severity === 'BACKLOG').length,
  };
}
