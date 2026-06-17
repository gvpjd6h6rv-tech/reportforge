'use strict';

function viewportMetrics() {
  const viewport = window.visualViewport || null;
  return {
    width: Math.max(0, Math.floor(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0)),
    height: Math.max(0, Math.floor(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0)),
    offsetLeft: Math.max(0, Math.floor(viewport?.offsetLeft || 0)),
    offsetTop: Math.max(0, Math.floor(viewport?.offsetTop || 0)),
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(Math.max(min, value), max);
}

function panelSize(el) {
  const rect = el?.getBoundingClientRect?.();
  return {
    width: Math.max(0, Math.ceil(rect?.width || el?.offsetWidth || 0)),
    height: Math.max(0, Math.ceil(rect?.height || el?.offsetHeight || 0)),
  };
}

function clampPosition(el, left, top, margin = 8) {
  const viewport = viewportMetrics();
  const size = panelSize(el);
  const minLeft = viewport.offsetLeft + margin;
  const minTop = viewport.offsetTop + margin;
  const maxLeft = Math.max(minLeft, viewport.offsetLeft + viewport.width - size.width - margin);
  const maxTop = Math.max(minTop, viewport.offsetTop + viewport.height - size.height - margin);
  return {
    left: clampNumber(left, minLeft, maxLeft),
    top: clampNumber(top, minTop, maxTop),
  };
}

function applyStoredPosition(el, storageKey, defaults) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw);
      if (typeof saved?.left === 'number' && typeof saved?.top === 'number') {
        return clampPosition(el, saved.left, saved.top);
      }
    }
  } catch (_) {}
  return clampPosition(el, defaults.left, defaults.top);
}

function persistPosition(storageKey, position) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(position));
  } catch (_) {}
}

function clearStoredPosition(storageKey) {
  try {
    localStorage.removeItem(storageKey);
  } catch (_) {}
}

function syncElementPosition(el, position, persist = true, storageKey = null) {
  const next = clampPosition(el, position.left, position.top);
  el.style.left = `${next.left}px`;
  el.style.top = `${next.top}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  if (persist && storageKey) persistPosition(storageKey, next);
  return next;
}
