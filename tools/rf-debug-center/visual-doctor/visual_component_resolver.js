function splitSelectors(selector = '') {
  return String(selector)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitParts(selector = '') {
  return String(selector).trim().split(/\s+/).filter(Boolean);
}

function parseSimpleSelector(part = '') {
  const attrs = [];
  let remaining = String(part).trim();
  for (const match of remaining.matchAll(/\[([^=\]]+)(?:=(['"]?)(.*?)\2)?\]/g)) {
    attrs.push({
      name: match[1].trim(),
      value: match[3] ?? '',
      hasValue: match[3] !== undefined,
    });
  }
  remaining = remaining.replace(/\[[^\]]+\]/g, '');
  const id = (remaining.match(/#([A-Za-z0-9_-]+)/) || [null, ''])[1];
  const classes = Array.from(remaining.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((match) => match[1]);
  const tag = remaining.replace(/[#.][A-Za-z0-9_-]+/g, '').trim().toLowerCase();
  return { tag, id, classes, attrs };
}

function snapshotAttr(snapshot, name) {
  if (name === 'id') return snapshot.id || '';
  if (name === 'class') return String(snapshot.className || '');
  if (name === 'role') return snapshot.role || '';
  if (name === 'type') return snapshot.type || '';
  if (name === 'aria-hidden') return snapshot.ariaHidden || '';
  if (name.startsWith('data-')) {
    const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return snapshot.dataset?.[key] ?? '';
  }
  return snapshot.dataset?.[name] ?? '';
}

function matchesSimple(snapshot, part) {
  if (!snapshot || !part) return false;
  const parsed = parseSimpleSelector(part);
  if (parsed.tag && parsed.tag !== snapshot.tagName) return false;
  if (parsed.id && parsed.id !== snapshot.id) return false;
  const snapshotClasses = String(snapshot.className || '').split(/\s+/).filter(Boolean);
  if (parsed.classes.some((cls) => !snapshotClasses.includes(cls))) return false;
  for (const attr of parsed.attrs) {
    const value = String(snapshotAttr(snapshot, attr.name) || '');
    if (attr.hasValue && value !== attr.value) return false;
    if (!attr.hasValue && !value) return false;
  }
  return true;
}

function matchesSelector(snapshot, selector) {
  return splitSelectors(selector).some((singleSelector) => {
    const parts = splitParts(singleSelector);
    if (!parts.length) return false;
    let currentIndex = snapshot.parents?.length ?? 0;
    if (!matchesSimple(snapshot, parts[parts.length - 1])) return false;
    for (let partIndex = parts.length - 2; partIndex >= 0; partIndex -= 1) {
      let matched = false;
      for (let parentIndex = currentIndex - 1; parentIndex >= 0; parentIndex -= 1) {
        if (matchesSimple(snapshot.parents[parentIndex], parts[partIndex])) {
          currentIndex = parentIndex;
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  });
}

function selectorSpecificity(selector = '') {
  const text = String(selector);
  const idCount = (text.match(/#/g) || []).length;
  const classCount = (text.match(/\./g) || []).length;
  const attrCount = (text.match(/\[/g) || []).length;
  const partCount = splitParts(text.replace(/,/g, ' ')).length;
  return idCount * 100 + classCount * 10 + attrCount * 8 + partCount;
}

function componentScore(snapshot, component) {
  let score = 0;
  const selectors = [
    ...(component.criticalSelectors || []),
    ...(component.requiredSelectors || []),
    ...(component.optionalSelectors || []),
    component.rootSelector,
  ].filter(Boolean);
  for (const selector of selectors) {
    if (matchesSelector(snapshot, selector)) {
      score = Math.max(score, selectorSpecificity(selector) + (component.criticalSelectors?.includes(selector) ? 50 : component.requiredSelectors?.includes(selector) ? 35 : component.optionalSelectors?.includes(selector) ? 15 : 20));
    }
  }
  if (score <= 0) return 0;
  return score + (Number(component.priority || 0) * 1000);
}

function bestComponent(snapshot, catalog = []) {
  let winner = null;
  let winnerScore = 0;
  for (const component of catalog) {
    const score = componentScore(snapshot, component);
    if (score > winnerScore) {
      winner = component;
      winnerScore = score;
    }
  }
  return winnerScore > 0 ? winner : null;
}

export function resolveVisualComponent(snapshot, catalog = []) {
  const component = bestComponent(snapshot, catalog);
  if (!component) return null;
  return {
    componentId: component.id,
    componentLabel: component.label,
    componentRole: component.expectedRole || '',
    componentRootSelector: component.rootSelector || '',
  };
}

export function groupSnapshotsByComponent(snapshots = [], catalog = []) {
  const groups = new Map();
  for (const snapshot of snapshots) {
    const resolved = resolveVisualComponent(snapshot, catalog);
    if (!resolved) continue;
    const next = groups.get(resolved.componentId) || {
      componentId: resolved.componentId,
      componentLabel: resolved.componentLabel,
      snapshots: [],
    };
    next.snapshots.push({
      ...snapshot,
      componentId: resolved.componentId,
      componentLabel: resolved.componentLabel,
    });
    groups.set(resolved.componentId, next);
  }
  return Array.from(groups.values());
}

export function findComponentSnapshots(componentId, snapshots = [], catalog = []) {
  const component = catalog.find((entry) => entry.id === componentId);
  if (!component) return [];
  return snapshots.filter((snapshot) => {
    const resolved = resolveVisualComponent(snapshot, [component]);
    return resolved?.componentId === componentId;
  }).map((snapshot) => ({
    ...snapshot,
    componentId: component.id,
    componentLabel: component.label,
  }));
}
