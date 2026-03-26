import assert from 'node:assert/strict';

export const VISUAL_CONFIDENCE_WEIGHTS = Object.freeze({
  modelParity:           { weight: 14, basis: 'evidence' },
  designPreviewParity:   { weight: 14, basis: 'evidence' },
  geometry:              { weight: 10, basis: 'evidence' },
  visibility:            { weight: 10, basis: 'evidence' },
  hitTesting:            { weight: 10, basis: 'evidence' },
  overlapCollision:      { weight: 8,  basis: 'heuristic' },
  clipping:              { weight: 8,  basis: 'evidence' },
  stacking:              { weight: 8,  basis: 'evidence' },
  temporalStability:     { weight: 10, basis: 'evidence' },
  interactionUsability:  { weight: 8,  basis: 'heuristic' },
  legibility:            { weight: 8,  basis: 'evidence' },
  subtleOcclusion:       { weight: 7,  basis: 'evidence' },
  compositorDivergence:  { weight: 5,  basis: 'heuristic' },
  crossBrowserStability: { weight: 4,  basis: 'heuristic' },
});

export function computeVisualConfidenceScore(signals = {}) {
  const breakdown = {};
  const diagnostics = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, meta] of Object.entries(VISUAL_CONFIDENCE_WEIGHTS)) {
    const raw = normalizeSignal(signals[key], key);
    totalWeight += meta.weight;
    weightedSum += raw.value * meta.weight;
    const score = Math.round(raw.value * 1000) / 10;
    breakdown[key] = {
      score,
      weight: meta.weight,
      basis: meta.basis,
      diagnostic: raw.diagnostic || null,
      evidence: raw.evidence || null,
    };
    if (raw.value < 0.95) {
      diagnostics.push({
        dimension: key,
        score,
        weight: meta.weight,
        basis: meta.basis,
        diagnostic: raw.diagnostic || null,
        evidence: raw.evidence || null,
      });
    }
  }

  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 1000) / 10 : 0;
  return {
    score,
    status: score >= 95 ? 'PASS' : (score >= 80 ? 'WARNING' : 'FAIL'),
    breakdown,
    diagnostics,
  };
}

export function assertVisualConfidence(result, options = {}) {
  const { min = 90 } = options;
  assert.ok(result && typeof result.score === 'number', 'visual confidence result missing');
  assert.ok(
    result.score >= min,
    `visual confidence ${result.score} < ${min}; diagnostics=${JSON.stringify(result.diagnostics)} breakdown=${JSON.stringify(result.breakdown)}`,
  );
}

function normalizeSignal(input, key) {
  if (typeof input === 'number') {
    return { value: clamp01(input), diagnostic: null, evidence: { source: key } };
  }
  if (!input) {
    return { value: 0, diagnostic: 'missing signal', evidence: { source: key } };
  }
  if (typeof input.value === 'number') {
    return {
      value: clamp01(input.value),
      diagnostic: input.diagnostic || null,
      evidence: input.evidence || null,
    };
  }
  return { value: 0, diagnostic: 'invalid signal shape', evidence: { source: key, raw: input } };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export async function collectUserParityState(page, options = {}) {
  const { textIncludes = null } = options;
  return page.evaluate(({ textIncludes }) => {
    const includesText = (node) => {
      if (!textIncludes) return true;
      return (node.textContent || '').includes(textIncludes);
    };
    const designNodes = [...document.querySelectorAll('.cr-element:not(.pv-el)')];
    const previewNodes = [...document.querySelectorAll('#preview-content .pv-el')];
    const modelElements = [...DS.elements];
    const modelMatches = modelElements.filter((el) => {
      if (!textIncludes) return true;
      return `${el.content || ''}${el.fieldPath || ''}`.includes(textIncludes);
    });
    const box = document.querySelector('#handles-layer .sel-box');
    const boxRect = box ? box.getBoundingClientRect() : null;

    return {
      previewMode: DS.previewMode,
      selection: [...DS.selection],
      modelCount: modelElements.length,
      modelIds: modelMatches.map((el) => el.id),
      designIds: designNodes.filter(includesText).map((el) => el.dataset.id),
      previewIds: previewNodes.filter(includesText).map((el) => el.dataset.originId || null),
      overlay: {
        boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
        handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
        boxRect: boxRect ? {
          left: boxRect.left,
          top: boxRect.top,
          width: boxRect.width,
          height: boxRect.height,
        } : null,
      },
    };
  }, { textIncludes });
}

export async function collectElementVisibility(page, options = {}) {
  const { id, mode = 'design' } = options;
  return page.evaluate(({ id, mode }) => {
    const parseColor = (value) => {
      const match = /rgba?\(([^)]+)\)/.exec(value || '');
      if (!match) return null;
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
      const [r = 0, g = 0, b = 0, a = 1] = parts;
      return { r, g, b, a: Number.isFinite(a) ? a : 1 };
    };
    const relativeChannel = (channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color) => {
      if (!color) return 1;
      return 0.2126 * relativeChannel(color.r) + 0.7152 * relativeChannel(color.g) + 0.0722 * relativeChannel(color.b);
    };
    const contrastRatio = (fg, bg) => {
      if (!fg || !bg) return null;
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const describePointHit = (hit) => {
      if (!hit) return null;
      return {
        tag: hit.tagName || null,
        id: hit.id || null,
        className: typeof hit.className === 'string' ? hit.className : null,
        datasetId: hit.dataset?.id || null,
        datasetOriginId: hit.dataset?.originId || null,
      };
    };
    const selector = mode === 'preview'
      ? `#preview-content .pv-el[data-origin-id="${id}"]`
      : `.cr-element:not(.pv-el)[data-id="${id}"]`;
    const candidates = [...document.querySelectorAll(selector)];
    const node = candidates
      .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))
      .map((entry) => entry.candidate)
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0
          && rect.height > 0
          && rect.bottom > 0
          && rect.right > 0
          && rect.top < window.innerHeight
          && rect.left < window.innerWidth;
      }) || candidates[0] || null;
    if (!node) {
      return {
        id,
        mode,
        exists: false,
        reason: `missing node for selector ${selector}`,
      };
    }

    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const textContent = (node.textContent || '').trim();
    let bgNode = node;
    let resolvedBackground = null;
    while (bgNode && bgNode.nodeType === Node.ELEMENT_NODE) {
      const bgStyle = getComputedStyle(bgNode);
      const parsed = parseColor(bgStyle.backgroundColor);
      if (parsed && parsed.a > 0) {
        resolvedBackground = bgStyle.backgroundColor;
        break;
      }
      bgNode = bgNode.parentElement;
    }
    if (!resolvedBackground) resolvedBackground = 'rgb(255, 255, 255)';
    const fontSize = Number.parseFloat(style.fontSize || '0');
    const textColor = style.color;
    const contrast = contrastRatio(parseColor(textColor), parseColor(resolvedBackground));
    const inViewport = rect.width > 0
      && rect.height > 0
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth;

    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const edgePoints = [
      { name: 'top', x: rect.left + rect.width / 2, y: rect.top + 1 },
      { name: 'right', x: rect.right - 1, y: rect.top + rect.height / 2 },
      { name: 'bottom', x: rect.left + rect.width / 2, y: rect.bottom - 1 },
      { name: 'left', x: rect.left + 1, y: rect.top + rect.height / 2 },
    ].filter((point) =>
      point.x >= 0
      && point.y >= 0
      && point.x < window.innerWidth
      && point.y < window.innerHeight
    );

    const elementFromCenter = inViewport ? document.elementFromPoint(center.x, center.y) : null;
    const elementsFromCenter = inViewport ? document.elementsFromPoint(center.x, center.y) : [];
    const edgeHits = edgePoints.map((point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        point: point.name,
        hit: hit ? {
          tag: hit.tagName || null,
          id: hit.id || null,
          className: typeof hit.className === 'string' ? hit.className : null,
          datasetId: hit.dataset?.id || null,
          datasetOriginId: hit.dataset?.originId || null,
        } : null,
      };
    });

    const quadrantPoints = rect.width > 4 && rect.height > 4 ? [
      { quadrant: 'tl', x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.25 },
      { quadrant: 'tr', x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.25 },
      { quadrant: 'bl', x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.75 },
      { quadrant: 'br', x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.75 },
    ].filter((p) => p.x >= 0 && p.y >= 0 && p.x < window.innerWidth && p.y < window.innerHeight) : [];
    const quadrantHits = inViewport ? quadrantPoints.map((p) => {
      const hit = document.elementFromPoint(p.x, p.y);
      return {
        quadrant: p.quadrant,
        hit: hit ? {
          tag: hit.tagName || null,
          id: hit.id || null,
          className: typeof hit.className === 'string' ? hit.className : null,
          datasetId: hit.dataset?.id || null,
          datasetOriginId: hit.dataset?.originId || null,
        } : null,
      };
    }) : [];

    const parentChain = [];
    let cur = node;
    while (cur && cur.nodeType === Node.ELEMENT_NODE && parentChain.length < 6) {
      const cs = getComputedStyle(cur);
      parentChain.push({
        tag: cur.tagName || null,
        id: cur.id || null,
        className: typeof cur.className === 'string' ? cur.className : null,
        overflow: `${cs.overflow}/${cs.overflowX}/${cs.overflowY}`,
        position: cs.position,
        zIndex: cs.zIndex,
      });
      cur = cur.parentElement;
    }

    const intersectRect = (a, b) => {
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      return right > left && bottom > top
        ? { left, top, right, bottom, width: right - left, height: bottom - top }
        : null;
    };

    let clipRect = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const clipAncestors = [];
    cur = node.parentElement;
    while (cur && cur.nodeType === Node.ELEMENT_NODE && clipAncestors.length < 6) {
      const cs = getComputedStyle(cur);
      const overflowValues = [cs.overflow, cs.overflowX, cs.overflowY];
      if (overflowValues.some((value) => ['hidden', 'clip', 'auto', 'scroll'].includes(value))) {
        const cr = cur.getBoundingClientRect();
        const clipInfo = {
          tag: cur.tagName || null,
          id: cur.id || null,
          className: typeof cur.className === 'string' ? cur.className : null,
          overflow: `${cs.overflow}/${cs.overflowX}/${cs.overflowY}`,
          rect: {
            left: cr.left,
            top: cr.top,
            right: cr.right,
            bottom: cr.bottom,
            width: cr.width,
            height: cr.height,
          },
        };
        clipAncestors.push(clipInfo);
        clipRect = intersectRect(clipRect, clipInfo.rect) || clipRect;
      }
      cur = cur.parentElement;
    }

    const ownRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
    const visibleRect = intersectRect(ownRect, clipRect);
    const rectArea = Math.max(ownRect.width * ownRect.height, 0);
    const visibleArea = visibleRect ? visibleRect.width * visibleRect.height : 0;
    const visibleRatio = rectArea > 0 ? visibleArea / rectArea : 0;

    return {
      id,
      mode,
      exists: true,
      matchCount: candidates.length,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      },
      inViewport,
      computed: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
        transform: style.transform,
        color: textColor,
        backgroundColor: resolvedBackground,
        fontSize,
      },
      text: {
        contentLength: textContent.length,
        contrastRatio: contrast,
      },
      centerHit: describePointHit(elementFromCenter),
      centerStack: elementsFromCenter.slice(0, 5).map(describePointHit),
      quadrantHits,
      edgeHits,
      parentChain,
      clipAncestors,
      visibleRect,
      visibleRatio,
    };
  }, { id, mode });
}

export async function collectSelectorVisibility(page, options = {}) {
  const { selector, mode = 'design' } = options;
  return page.evaluate(({ selector, mode }) => {
    const describePointHit = (hit) => {
      if (!hit) return null;
      return {
        tag: hit.tagName || null,
        id: hit.id || null,
        className: typeof hit.className === 'string' ? hit.className : null,
        datasetPos: hit.dataset?.pos || null,
        datasetId: hit.dataset?.id || null,
      };
    };
    const node = document.querySelector(selector);
    if (!node) {
      return { selector, mode, exists: false, reason: `missing selector ${selector}` };
    }
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const inViewport = rect.width > 0
      && rect.height > 0
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth;
    const centerHit = inViewport ? document.elementFromPoint(center.x, center.y) : null;
    const centerStack = inViewport ? document.elementsFromPoint(center.x, center.y).slice(0, 5).map(describePointHit) : [];
    return {
      selector,
      mode,
      exists: true,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      inViewport,
      computed: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
      },
      centerHit: describePointHit(centerHit),
      centerStack,
      nodeMeta: {
        tag: node.tagName || null,
        id: node.id || null,
        className: typeof node.className === 'string' ? node.className : null,
        datasetPos: node.dataset?.pos || null,
        datasetId: node.dataset?.id || null,
      },
    };
  }, { selector, mode });
}

export async function collectBoundingBoxMap(page, options = {}) {
  const { ids = [], mode = 'design' } = options;
  const entries = await Promise.all(ids.map((id) => collectElementVisibility(page, { id, mode })));
  return Object.fromEntries(entries.map((entry) => [entry.id, entry.rect || null]));
}

export function assertBoundingBoxDriftWithin(actualRect, expectedRect, label, tolerance = 1.5) {
  assert.ok(actualRect && expectedRect, `${label}: missing rect(s)`);
  for (const key of ['left', 'top', 'width', 'height']) {
    const drift = Math.abs((actualRect[key] || 0) - (expectedRect[key] || 0));
    assert.ok(
      drift <= tolerance,
      `${label}: ${key} drift ${drift} > ${tolerance} (actual=${actualRect[key]}, expected=${expectedRect[key]})`,
    );
  }
}

export async function collectHitMap(page, options = {}) {
  const { id, mode = 'design', grid = 3 } = options;
  return page.evaluate(({ id, mode, grid }) => {
    const selector = mode === 'preview'
      ? `#preview-content .pv-el[data-origin-id="${id}"]`
      : `.cr-element:not(.pv-el)[data-id="${id}"]`;
    const node = document.querySelector(selector);
    if (!node) return { id, mode, exists: false, samples: [] };
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { id, mode, exists: true, samples: [], rect: null };
    const samples = [];
    for (let row = 1; row <= grid; row += 1) {
      for (let col = 1; col <= grid; col += 1) {
        const x = rect.left + (rect.width * col / (grid + 1));
        const y = rect.top + (rect.height * row / (grid + 1));
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        samples.push({
          x,
          y,
          hit: hit ? {
            tag: hit.tagName || null,
            id: hit.id || null,
            className: typeof hit.className === 'string' ? hit.className : null,
            datasetId: hit.dataset?.id || null,
            datasetOriginId: hit.dataset?.originId || null,
          } : null,
        });
      }
    }
    return {
      id,
      mode,
      exists: true,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      samples,
    };
  }, { id, mode, grid });
}

export function assertHitMapCoverage(hitMap, label, options = {}) {
  const { minCoverage = 0.3 } = options;
  assert.ok(hitMap && hitMap.exists, `${label}: hit map missing`);
  assert.ok(Array.isArray(hitMap.samples) && hitMap.samples.length > 0, `${label}: no hit map samples`);
  const matchesSelf = (hit) => hit
    && ((hitMap.mode === 'preview' && hit.datasetOriginId === hitMap.id)
      || (hitMap.mode !== 'preview' && hit.datasetId === hitMap.id));
  const coverage = hitMap.samples.filter((sample) => matchesSelf(sample.hit)).length / hitMap.samples.length;
  assert.ok(
    coverage >= minCoverage,
    `${label}: hit-map coverage ${coverage} < ${minCoverage}; samples=${JSON.stringify(hitMap.samples)}`,
  );
}

export function computeOverlapPairs(entries = []) {
  const pairs = [];
  const area = (rect) => Math.max(0, (rect?.width || 0) * (rect?.height || 0));
  const intersect = (a, b) => {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return right > left && bottom > top
      ? { width: right - left, height: bottom - top }
      : null;
  };
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (!a.rect || !b.rect) continue;
      const overlap = intersect(a.rect, b.rect);
      const overlapArea = overlap ? overlap.width * overlap.height : 0;
      const minArea = Math.min(area(a.rect), area(b.rect));
      const overlapRatio = minArea > 0 ? overlapArea / minArea : 0;
      pairs.push({ a: a.id || a.selector, b: b.id || b.selector, overlapRatio, overlapArea });
    }
  }
  return pairs;
}

export function assertNoUnexpectedOverlap(entries, label, options = {}) {
  const { maxOverlapRatio = 0.75 } = options;
  const offenders = computeOverlapPairs(entries).filter((pair) => pair.overlapRatio > maxOverlapRatio);
  assert.equal(
    offenders.length,
    0,
    `${label}: unexpected overlap ${JSON.stringify(offenders)}`,
  );
}

export function assertSameIdSet(actualIds, expectedIds, label) {
  assert.deepEqual(
    [...actualIds].sort(),
    [...expectedIds].sort(),
    `${label}: expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(actualIds)}`,
  );
}

export function ratioIdParity(actualIds, expectedIds, label = 'id parity') {
  const actual = new Set(actualIds || []);
  const expected = new Set(expectedIds || []);
  const union = new Set([...actual, ...expected]);
  const matches = [...union].filter((id) => actual.has(id) && expected.has(id)).length;
  const value = union.size > 0 ? matches / union.size : 1;
  return {
    value,
    diagnostic: value === 1 ? null : `${label}: actual=${JSON.stringify([...actual])} expected=${JSON.stringify([...expected])}`,
    evidence: {
      actual: [...actual],
      expected: [...expected],
      union: [...union],
    },
  };
}

export function assertVisibleParity(state, label) {
  if (state.previewMode) {
    assertSameIdSet(state.previewIds, state.modelIds, `${label} preview vs model`);
    return;
  }
  assertSameIdSet(state.designIds, state.modelIds, `${label} design vs model`);
}

export function assertDesignParity(state, label) {
  assertSameIdSet(state.designIds, state.modelIds, `${label} design vs model`);
}

export function assertPreviewParity(state, label) {
  assertSameIdSet(state.previewIds, state.modelIds, `${label} preview vs model`);
}

export function assertElementActuallyVisible(info, label) {
  assert.ok(info && info.exists, `${label}: element missing (${info?.reason || 'unknown'})`);
  assert.ok(info.rect, `${label}: missing bounding rect`);
  assert.ok(info.rect.width > 0 && info.rect.height > 0,
    `${label}: element exists but bounding box is degenerate ${JSON.stringify(info.rect)}`);
  assert.ok(info.inViewport, `${label}: element exists but is outside viewport ${JSON.stringify(info.rect)}`);
  assert.notEqual(info.computed.display, 'none', `${label}: display:none`);
  assert.notEqual(info.computed.visibility, 'hidden', `${label}: visibility:hidden`);
  assert.notEqual(info.computed.visibility, 'collapse', `${label}: visibility:collapse`);
  assert.ok(Number.parseFloat(info.computed.opacity || '1') > 0,
    `${label}: opacity=${info.computed.opacity}`);
}

export function visibilitySignal(entries = [], label = 'visibility') {
  const total = entries.length;
  if (total === 0) return { value: 1, diagnostic: null, evidence: { total: 0 } };
  const good = entries.filter((entry) => {
    const opacity = Number.parseFloat(entry.computed?.opacity || '1');
    return entry.exists
      && entry.rect
      && entry.rect.width > 0
      && entry.rect.height > 0
      && entry.inViewport
      && entry.computed?.display !== 'none'
      && entry.computed?.visibility !== 'hidden'
      && entry.computed?.visibility !== 'collapse'
      && opacity > 0;
  }).length;
  const value = good / total;
  return {
    value,
    diagnostic: value === 1 ? null : `${label}: ${good}/${total} entries effectively visible`,
    evidence: entries,
  };
}

export function assertElementHitTestable(info, label) {
  assertElementActuallyVisible(info, label);
  const matchesSelf = (hit) => hit
    && ((info.mode === 'preview' && hit.datasetOriginId === info.id)
      || (info.mode !== 'preview' && hit.datasetId === info.id));
  const usableEdgeHit = Array.isArray(info.edgeHits) && info.edgeHits.some((entry) => matchesSelf(entry.hit));
  const centerHitMatches = matchesSelf(info.centerHit);
  assert.ok(
    centerHitMatches || usableEdgeHit,
    `${label}: no usable hit point on self; center=${JSON.stringify(info.centerHit)} edges=${JSON.stringify(info.edgeHits)} stack=${JSON.stringify(info.centerStack)}`,
  );
}

export function hitTestingSignal(entries = [], label = 'hit-testing') {
  const total = entries.length;
  if (total === 0) return { value: 1, diagnostic: null, evidence: { total: 0 } };
  const matchesSelf = (entry, hit) => hit
    && ((entry.mode === 'preview' && hit.datasetOriginId === entry.id)
      || (entry.mode !== 'preview' && hit.datasetId === entry.id));
  const good = entries.filter((entry) => {
    const center = matchesSelf(entry, entry.centerHit);
    const edge = Array.isArray(entry.edgeHits) && entry.edgeHits.some((item) => matchesSelf(entry, item.hit));
    return center || edge;
  }).length;
  const value = good / total;
  return {
    value,
    diagnostic: value === 1 ? null : `${label}: ${good}/${total} entries hit-testable`,
    evidence: entries,
  };
}

export function assertElementNotSeverelyClipped(info, label, options = {}) {
  const { minVisibleRatio = 0.35 } = options;
  assertElementActuallyVisible(info, label);
  assert.ok(
    typeof info.visibleRatio === 'number' && info.visibleRatio >= minVisibleRatio,
    `${label}: visible ratio ${info.visibleRatio} < ${minVisibleRatio}; visibleRect=${JSON.stringify(info.visibleRect)} clipAncestors=${JSON.stringify(info.clipAncestors)}`,
  );
}

export function clippingSignal(entries = [], label = 'clipping', options = {}) {
  const { minVisibleRatio = 0.35 } = options;
  const total = entries.length;
  if (total === 0) return { value: 1, diagnostic: null, evidence: { total: 0 } };
  const ratios = entries.map((entry) => {
    const raw = typeof entry.visibleRatio === 'number' ? entry.visibleRatio : 0;
    return clamp01(raw / minVisibleRatio);
  });
  const value = ratios.reduce((sum, current) => sum + current, 0) / total;
  return {
    value,
    diagnostic: value >= 1 ? null : `${label}: visible ratios below threshold ${minVisibleRatio}`,
    evidence: entries.map((entry) => ({
      id: entry.id,
      mode: entry.mode,
      visibleRatio: entry.visibleRatio,
      clipAncestors: entry.clipAncestors,
      visibleRect: entry.visibleRect,
    })),
  };
}

export function assertSelectorActuallyVisible(info, label) {
  assert.ok(info && info.exists, `${label}: selector missing (${info?.reason || 'unknown'})`);
  assert.ok(info.rect && info.rect.width > 0 && info.rect.height > 0,
    `${label}: selector exists but bounding box is degenerate ${JSON.stringify(info.rect)}`);
  assert.ok(info.inViewport, `${label}: selector exists but is outside viewport ${JSON.stringify(info.rect)}`);
  assert.notEqual(info.computed.display, 'none', `${label}: display:none`);
  assert.notEqual(info.computed.visibility, 'hidden', `${label}: visibility:hidden`);
  assert.ok(Number.parseFloat(info.computed.opacity || '1') > 0, `${label}: opacity=${info.computed.opacity}`);
}

export function assertSelectorHitTestable(info, label, matcher) {
  assertSelectorActuallyVisible(info, label);
  const hit = info.centerHit;
  assert.ok(hit, `${label}: missing center hit`);
  assert.ok(
    matcher(hit, info),
    `${label}: center hit falls on ${JSON.stringify(hit)} stack=${JSON.stringify(info.centerStack)} node=${JSON.stringify(info.nodeMeta)}`,
  );
}

export function stackingSignal(selectors = [], matcher, label = 'stacking') {
  const total = selectors.length;
  if (total === 0) return { value: 1, diagnostic: null, evidence: { total: 0 } };
  const good = selectors.filter((entry) => matcher(entry.centerHit, entry)).length;
  const value = good / total;
  return {
    value,
    diagnostic: value === 1 ? null : `${label}: ${good}/${total} selectors stack correctly`,
    evidence: selectors,
  };
}

export function assertVisibleCompositionParity(entries, label) {
  entries.forEach((entry) => {
    assertElementActuallyVisible(entry, `${label}:${entry.mode}:${entry.id}`);
    assertElementHitTestable(entry, `${label}:${entry.mode}:${entry.id}`);
  });
}

export function overlapSignal(entries = [], label = 'overlap', options = {}) {
  const { maxOverlapRatio = 0.75 } = options;
  const pairs = computeOverlapPairs(entries);
  if (pairs.length === 0) return { value: 1, diagnostic: null, evidence: [] };
  const offenders = pairs.filter((pair) => pair.overlapRatio > maxOverlapRatio);
  const value = 1 - (offenders.length / pairs.length);
  return {
    value,
    diagnostic: offenders.length === 0 ? null : `${label}: ${offenders.length}/${pairs.length} overlap offenders`,
    evidence: offenders.length === 0 ? pairs : offenders,
  };
}

export async function captureAsyncPhases(page, collect, phasePrefix = 'phase') {
  const phases = [];
  phases.push({ phase: `${phasePrefix}:sync`, state: await collect() });
  await page.evaluate(() => Promise.resolve());
  phases.push({ phase: `${phasePrefix}:microtask`, state: await collect() });
  await page.waitForTimeout(0);
  phases.push({ phase: `${phasePrefix}:timeout0`, state: await collect() });
  for (let i = 1; i <= 2; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    phases.push({ phase: `${phasePrefix}:raf${i}`, state: await collect() });
  }
  return phases;
}

export async function captureDenseAsyncPhases(page, collect, options = {}) {
  const {
    phasePrefix = 'dense',
    microtasks = 2,
    timeouts = [0, 4, 8, 16],
    rafs = 6,
    fuzzMs = 6,
  } = options;
  const phases = [];
  phases.push({ phase: `${phasePrefix}:sync`, state: await collect() });
  for (let i = 1; i <= microtasks; i += 1) {
    await page.evaluate(() => Promise.resolve());
    phases.push({ phase: `${phasePrefix}:microtask${i}`, state: await collect() });
  }
  for (const timeout of timeouts) {
    await page.waitForTimeout(timeout);
    phases.push({ phase: `${phasePrefix}:timeout${timeout}`, state: await collect() });
  }
  for (let i = 1; i <= rafs; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    if (fuzzMs > 0) await page.waitForTimeout(fuzzMs);
    phases.push({ phase: `${phasePrefix}:raf${i}`, state: await collect() });
  }
  return phases;
}

export async function captureTemporalFrames(page, selector, options = {}) {
  const {
    frames = 6,
    phasePrefix = 'temporal',
    microtasks = 1,
    timeouts = [0, 4, 8, 16],
  } = options;
  const snapshots = [];
  const collectFrame = async (phase) => {
    const state = await page.evaluate((targetSelector) => {
      const node = document.querySelector(targetSelector);
      if (!node) return { exists: false, rect: null };
      const rect = node.getBoundingClientRect();
      return {
        exists: true,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        },
      };
    }, selector);
    snapshots.push({ phase, ...state });
  };

  await collectFrame(`${phasePrefix}:sync`);
  for (let i = 1; i <= microtasks; i += 1) {
    await page.evaluate(() => Promise.resolve());
    await collectFrame(`${phasePrefix}:microtask${i}`);
  }
  for (const timeout of timeouts) {
    await page.waitForTimeout(timeout);
    await collectFrame(`${phasePrefix}:timeout${timeout}`);
  }
  for (let i = 1; i <= frames; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    await collectFrame(`${phasePrefix}:raf${i}`);
  }
  return snapshots;
}

export function computeMicroJitterScore(frames = [], options = {}) {
  const { driftThresholdPx = 1 } = options;
  if (!Array.isArray(frames) || frames.length <= 1) {
    return {
      jitterScore: 0,
      frameDropDetected: false,
      diagnostics: [],
    };
  }
  const diagnostics = [];
  let driftEvents = 0;
  let comparisons = 0;
  let frameDropDetected = false;

  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const curr = frames[i];
    if (!prev.exists || !curr.exists) {
      frameDropDetected = true;
      diagnostics.push({
        phase: curr.phase,
        reason: 'missing frame node',
        prevExists: prev.exists,
        currExists: curr.exists,
      });
      continue;
    }
    const deltas = {
      left: Math.abs((curr.rect?.left || 0) - (prev.rect?.left || 0)),
      top: Math.abs((curr.rect?.top || 0) - (prev.rect?.top || 0)),
      width: Math.abs((curr.rect?.width || 0) - (prev.rect?.width || 0)),
      height: Math.abs((curr.rect?.height || 0) - (prev.rect?.height || 0)),
    };
    comparisons += 1;
    const maxDelta = Math.max(deltas.left, deltas.top, deltas.width, deltas.height);
    if (maxDelta > driftThresholdPx) {
      driftEvents += 1;
      diagnostics.push({
        phase: curr.phase,
        reason: 'micro-jitter',
        deltas,
      });
    }
    if ((curr.rect?.width || 0) <= 0 || (curr.rect?.height || 0) <= 0) {
      frameDropDetected = true;
      diagnostics.push({
        phase: curr.phase,
        reason: 'degenerate rect',
        rect: curr.rect,
      });
    }
  }

  return {
    jitterScore: comparisons > 0 ? driftEvents / comparisons : 0,
    frameDropDetected,
    diagnostics,
  };
}

export async function captureFrameTimeline(page, collect, options = {}) {
  const { frames = 3, phasePrefix = 'frame' } = options;
  const snapshots = [];
  for (let index = 1; index <= frames; index += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    snapshots.push({ phase: `${phasePrefix}:${index}`, state: await collect() });
  }
  return snapshots;
}

export function geometrySignalFromRectChecks(checks = [], label = 'geometry') {
  if (!checks.length) return { value: 1, diagnostic: null, evidence: [] };
  const total = checks.length;
  const good = checks.filter((item) => item.ok === true).length;
  return {
    value: good / total,
    diagnostic: good === total ? null : `${label}: ${good}/${total} geometry checks passed`,
    evidence: checks,
  };
}

export function scoreTemporalStability(timeline, predicate) {
  const total = Array.isArray(timeline) ? timeline.length : 0;
  const bad = (timeline || []).filter(({ state }) => !predicate(state)).length;
  return {
    total,
    bad,
    score: total > 0 ? (total - bad) / total : 0,
  };
}

export function assertTemporalStability(timeline, predicate, label, options = {}) {
  const { minScore = 1 } = options;
  const result = scoreTemporalStability(timeline, predicate);
  assert.ok(
    result.score >= minScore,
    `${label}: temporal stability ${result.score} < ${minScore}; total=${result.total} bad=${result.bad} timeline=${JSON.stringify(timeline)}`,
  );
}

export function temporalStabilitySignal(timeline, predicate, label = 'temporal stability') {
  const result = scoreTemporalStability(timeline, predicate);
  return {
    value: result.score,
    diagnostic: result.score === 1 ? null : `${label}: ${result.bad}/${result.total} unstable frames`,
    evidence: {
      total: result.total,
      bad: result.bad,
      timeline,
    },
  };
}

export function interactionUsabilitySignal(hitMaps = [], label = 'interaction usability', options = {}) {
  const { minCoverage = 0.3 } = options;
  if (!hitMaps.length) return { value: 1, diagnostic: null, evidence: [] };
  const coverages = hitMaps.map((hitMap) => {
    if (!hitMap.samples?.length) return 0;
    const good = hitMap.samples.filter((sample) => {
      const hit = sample.hit;
      return hit && (
        (hitMap.mode === 'preview' && hit.datasetOriginId === hitMap.id)
        || (hitMap.mode !== 'preview' && hit.datasetId === hitMap.id)
      );
    }).length;
    return good / hitMap.samples.length;
  });
  const value = coverages.reduce((sum, current) => sum + clamp01(current / minCoverage), 0) / coverages.length;
  return {
    value,
    diagnostic: value >= 1 ? null : `${label}: one or more targets below usable coverage ${minCoverage}`,
    evidence: hitMaps.map((hitMap, index) => ({
      id: hitMap.id,
      mode: hitMap.mode,
      coverage: coverages[index],
      samples: hitMap.samples,
    })),
  };
}

export function legibilitySignal(entries = [], label = 'legibility', options = {}) {
  const { minContrast = 3, minFontSize = 10 } = options;
  const textEntries = entries.filter((entry) => (entry.text?.contentLength || 0) > 0);
  if (!textEntries.length) return { value: 1, diagnostic: null, evidence: [] };
  const scores = textEntries.map((entry) => {
    const contrast = entry.text?.contrastRatio ?? 0;
    const fontSize = entry.computed?.fontSize ?? 0;
    const contrastScore = clamp01(contrast / minContrast);
    const fontScore = clamp01(fontSize / minFontSize);
    return Math.min(contrastScore, fontScore);
  });
  const value = scores.reduce((sum, current) => sum + current, 0) / scores.length;
  return {
    value,
    diagnostic: value >= 1 ? null : `${label}: contrast/font size below useful threshold`,
    evidence: textEntries.map((entry) => ({
      id: entry.id,
      mode: entry.mode,
      contrastRatio: entry.text?.contrastRatio ?? null,
      fontSize: entry.computed?.fontSize ?? null,
      textLength: entry.text?.contentLength ?? 0,
    })),
  };
}

export function subtleOcclusionSignal(entries = [], label = 'subtle occlusion', options = {}) {
  const { minVisibleRatio = 0.8, minSelfHitRatio = 0.6 } = options;
  if (!entries.length) return { value: 1, diagnostic: null, evidence: [] };
  const perEntry = entries.map((entry) => {
    const visibleRatio = typeof entry.visibleRatio === 'number' ? entry.visibleRatio : 0;
    const hits = [entry.centerHit, ...(entry.edgeHits || []).map((item) => item.hit)];
    const selfHits = hits.filter((hit) => hit && (
      (entry.mode === 'preview' && hit.datasetOriginId === entry.id)
      || (entry.mode !== 'preview' && hit.datasetId === entry.id)
    )).length;
    const hitRatio = hits.length ? selfHits / hits.length : 0;
    return Math.min(clamp01(visibleRatio / minVisibleRatio), clamp01(hitRatio / minSelfHitRatio));
  });
  const value = perEntry.reduce((sum, current) => sum + current, 0) / perEntry.length;
  return {
    value,
    diagnostic: value >= 1 ? null : `${label}: one or more entries partially occluded or weakly exposed`,
    evidence: entries.map((entry, index) => ({
      id: entry.id,
      mode: entry.mode,
      visibleRatio: entry.visibleRatio,
      centerHit: entry.centerHit,
      edgeHits: entry.edgeHits,
      score: perEntry[index],
    })),
  };
}

export function computeSeparationPairs(entries = []) {
  const pairs = [];
  const gap = (a, b) => {
    const horizontal = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
    const vertical = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
    if (horizontal === 0 && vertical === 0) return 0;
    if (horizontal === 0) return vertical;
    if (vertical === 0) return horizontal;
    return Math.hypot(horizontal, vertical);
  };
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (!entries[i].rect || !entries[j].rect) continue;
      pairs.push({
        a: entries[i].id || entries[i].selector,
        b: entries[j].id || entries[j].selector,
        gap: gap(entries[i].rect, entries[j].rect),
      });
    }
  }
  return pairs;
}

export function assertMinimumSeparation(entries, label, options = {}) {
  const { minGap = 2 } = options;
  const offenders = computeSeparationPairs(entries).filter((pair) => pair.gap < minGap);
  assert.equal(offenders.length, 0, `${label}: insufficient separation ${JSON.stringify(offenders)}`);
}

export function compositorDivergenceSignal(results = [], label = 'compositor divergence') {
  if (results.length <= 1) {
    return {
      value: 1,
      diagnostic: null,
      evidence: { comparedBrowsers: results.map((result) => result.browserName), reason: 'single browser available' },
    };
  }
  const scores = [];
  for (let i = 0; i < results.length; i += 1) {
    for (let j = i + 1; j < results.length; j += 1) {
      const a = results[i];
      const b = results[j];
      const score = clamp01(1 - Math.abs((a.score || 0) - (b.score || 0)) / 100);
      scores.push({ a: a.browserName, b: b.browserName, score, aScore: a.score, bScore: b.score });
    }
  }
  const value = scores.reduce((sum, current) => sum + current.score, 0) / scores.length;
  return {
    value,
    diagnostic: value >= 0.95 ? null : `${label}: browser score spread detected`,
    evidence: scores,
  };
}

export function crossBrowserStabilitySignal(results = [], availability = null, label = 'cross-browser stability') {
  const available = results.map((result) => result.browserName);
  const missing = availability
    ? Object.entries(availability).filter(([, info]) => !info.available).map(([browserName, info]) => ({ browserName, reason: info.reason }))
    : [];
  if (results.length <= 1) {
    return {
      value: 1,
      diagnostic: missing.length ? `${label}: only ${available.join(', ')} available; missing=${JSON.stringify(missing)}` : null,
      evidence: { available, missing },
    };
  }
  const sets = results.map((result) => JSON.stringify([...new Set(result.ids || [])].sort()));
  const stable = sets.every((set) => set === sets[0]);
  return {
    value: stable ? 1 : 0,
    diagnostic: stable ? (missing.length ? `${label}: missing browsers=${JSON.stringify(missing)}` : null) : `${label}: visible ids differ across browsers`,
    evidence: { results, missing },
  };
}

export async function dragSelectedWithSnapshots(page, options = {}) {
  const {
    dx = 20,
    dy = 16,
    steps = 6,
    collect = null,
  } = options;

  const target = page.locator('.cr-element.selected').first();
  const box = await target.boundingBox();
  assert.ok(box, 'selected element bounding box missing');

  const snapshots = [];
  await page.mouse.move(box.x + 20, box.y + Math.min(8, box.height / 2));
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    const x = box.x + 20 + (dx * step / steps);
    const y = box.y + Math.min(8, box.height / 2) + (dy * step / steps);
    await page.mouse.move(x, y);
    if (collect) snapshots.push({ step, state: await collect() });
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
  return snapshots;
}

// ---------------------------------------------------------------------------
// Fine composition: detailed occlusion measurement
// ---------------------------------------------------------------------------

export function measureOcclusionDetail(entry) {
  if (!entry || !entry.exists) {
    return { selfHitRatio: 0, occludedRatio: 1, occlusionLevel: 'total', topOccludingNodes: [] };
  }
  const matchesSelf = (hit) => hit && (
    (entry.mode === 'preview' && hit.datasetOriginId === entry.id)
    || (entry.mode !== 'preview' && hit.datasetId === entry.id)
  );
  // center + quadrants (new) + edges = up to 9 points
  const allPoints = [
    { point: 'center', hit: entry.centerHit },
    ...(entry.quadrantHits || []).map((qh) => ({ point: `q:${qh.quadrant}`, hit: qh.hit })),
    ...(entry.edgeHits || []).map((eh) => ({ point: `edge:${eh.point}`, hit: eh.hit })),
  ];
  if (allPoints.length === 0) {
    return { selfHitRatio: 1, occludedRatio: 0, occlusionLevel: 'none', topOccludingNodes: [] };
  }
  const selfCount = allPoints.filter((item) => matchesSelf(item.hit)).length;
  const selfHitRatio = selfCount / allPoints.length;
  const occludedRatio = 1 - selfHitRatio;
  let occlusionLevel;
  if (selfHitRatio >= 0.8) occlusionLevel = 'none';
  else if (selfHitRatio >= 0.3) occlusionLevel = 'partial';
  else if (selfHitRatio > 0) occlusionLevel = 'functional';
  else occlusionLevel = 'total';
  const seen = new Set();
  const topOccludingNodes = allPoints
    .filter((item) => item.hit && !matchesSelf(item.hit))
    .map((item) => item.hit)
    .filter((node) => {
      const key = `${node.tag}#${node.id || ''}.${node.datasetId || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  return { selfHitRatio, occludedRatio, occlusionLevel, topOccludingNodes };
}

// ---------------------------------------------------------------------------
// Fine composition: visual separation quality between a set of elements
// ---------------------------------------------------------------------------

export function cloneSeparationQuality(entries = []) {
  const valid = entries.filter((e) => e.exists && e.rect);
  if (valid.length < 2) {
    return { minGapPx: null, maxOverlapRatio: 0, separationScore: 1, collapseRisk: 'low', pairs: [] };
  }
  const sepPairs = computeSeparationPairs(valid);
  const ovlPairs = computeOverlapPairs(valid);
  const minGapPx = sepPairs.length ? Math.min(...sepPairs.map((p) => p.gap)) : null;
  const maxOverlapRatio = ovlPairs.length ? Math.max(...ovlPairs.map((p) => p.overlapRatio)) : 0;
  // normalize gap to 4px for score; collapse only when nearly fully stacked
  const gapScore = minGapPx == null ? 1 : clamp01(minGapPx / 4);
  const overlapScore = clamp01(1 - maxOverlapRatio);
  const separationScore = Math.min(gapScore, overlapScore);
  let collapseRisk;
  if (maxOverlapRatio > 0.9) collapseRisk = 'critical';             // bboxes nearly identical → true collapse
  else if ((minGapPx != null && minGapPx < 1) || maxOverlapRatio > 0.5) collapseRisk = 'high';  // touching/heavy overlap
  else collapseRisk = 'low';
  return {
    minGapPx: minGapPx != null ? Math.round(minGapPx * 10) / 10 : null,
    maxOverlapRatio: Math.round(maxOverlapRatio * 1000) / 1000,
    separationScore,
    collapseRisk,
    pairs: sepPairs.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Fine composition: assertions
// ---------------------------------------------------------------------------

export function assertNoCriticalOcclusion(entries = [], label, options = {}) {
  // maxOccludedRatio: fail if element has more than this fraction of its sampling points occluded
  // (default 0.9 = 90% → only fully unreachable elements; use lower threshold for stricter flows)
  const { maxOccludedRatio = 0.9 } = options;
  const offenders = entries
    .filter((e) => e.exists)
    .map((e) => ({ id: e.id, detail: measureOcclusionDetail(e) }))
    .filter(({ detail }) =>
      detail.occlusionLevel === 'total'
      || detail.occludedRatio > maxOccludedRatio,
    );
  assert.equal(
    offenders.length,
    0,
    `${label}: critical occlusion detected ${JSON.stringify(offenders.map(({ id, detail }) => ({
      id,
      occlusionLevel: detail.occlusionLevel,
      occludedRatio: Math.round(detail.occludedRatio * 100) / 100,
      topOccludingNodes: detail.topOccludingNodes,
    })))}`,
  );
}

export function assertCloneSeparation(entries = [], label, options = {}) {
  // minGapPx: when > 0, also enforces explicit gap threshold beyond collapse detection
  const { minGapPx = 0 } = options;
  const quality = cloneSeparationQuality(entries);
  if (quality.collapseRisk === 'critical') {
    assert.fail(
      `${label}: visual collapse (>90% overlap) minGapPx=${quality.minGapPx} maxOverlapRatio=${quality.maxOverlapRatio} pairs=${JSON.stringify(quality.pairs)}`,
    );
  }
  if (minGapPx > 0 && quality.minGapPx != null) {
    assert.ok(
      quality.minGapPx >= minGapPx,
      `${label}: clone separation below threshold; minGapPx=${quality.minGapPx} required=${minGapPx} maxOverlapRatio=${quality.maxOverlapRatio}`,
    );
  }
}

export function assertHandleNotOccluded(info, label) {
  assert.ok(info && info.exists, `${label}: handle element missing`);
  const hit = info.centerHit;
  const isInteractable = hit && (
    hit.className?.includes('sel-handle')
    || hit.className?.includes('sel-box')
    || hit.datasetPos != null
  );
  if (!isInteractable) {
    const occludingNode = info.centerStack?.[0];
    assert.fail(
      `${label}: handle functionally occluded by ${JSON.stringify(occludingNode)}; stack=${JSON.stringify(info.centerStack?.slice(0, 3))}`,
    );
  }
}
