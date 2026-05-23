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

function makePanelDraggable(el, handle, storageKey, defaults) {
  if (!el || !handle) return null;

  const controls = {
    storageKey,
    defaults,
    reset() {
      clearStoredPosition(storageKey);
      return syncElementPosition(el, defaults, false, storageKey);
    },
    clamp() {
      return syncElementPosition(el, { left: el.offsetLeft || defaults.left, top: el.offsetTop || defaults.top }, true, storageKey);
    },
    getPosition() {
      return { left: el.offsetLeft || defaults.left, top: el.offsetTop || defaults.top };
    },
  };

  const loadPosition = () => {
    const next = applyStoredPosition(el, storageKey, defaults);
    syncElementPosition(el, next, false, storageKey);
    return next;
  };

  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a, [data-no-drag="true"]')) return;
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      left: el.offsetLeft || defaults.left,
      top: el.offsetTop || defaults.top,
    };
    handle.classList.add('is-dragging');
    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    syncElementPosition(
      el,
      { left: drag.left + (event.clientX - drag.startX), top: drag.top + (event.clientY - drag.startY) },
      false,
      storageKey,
    );
  });
  const stopDrag = (event) => {
    if (!drag) return;
    drag = null;
    handle.classList.remove('is-dragging');
    const next = syncElementPosition(el, { left: el.offsetLeft, top: el.offsetTop }, true, storageKey);
    if (handle.releasePointerCapture && typeof event?.pointerId === 'number') {
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    return next;
  };
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);

  const onResize = () => {
    syncElementPosition(el, { left: el.offsetLeft || defaults.left, top: el.offsetTop || defaults.top }, true, storageKey);
  };
  window.addEventListener('resize', onResize);
  if (window.visualViewport?.addEventListener) {
    window.visualViewport.addEventListener('resize', onResize);
    window.visualViewport.addEventListener('scroll', onResize);
  }

  loadPosition();
  el.__rfPanelDraggable = controls;
  return controls;
}

function syncDebugHudStack() {
  const build = document.getElementById('rf-build-debug');
  const zoom = document.getElementById('rf-zoom-live-debug');
  if (!build && !zoom) return null;

  const viewport = viewportMetrics();
  const margin = 8;
  const gap = 8;
  const zoomWidget = document.getElementById('zoom-widget');
  const zoomWidgetRect = zoomWidget?.getBoundingClientRect?.() || null;

  if (build) {
    build.style.right = `${margin}px`;
    const buildBottom = zoomWidgetRect ? Math.max(margin, Math.ceil((viewport.height - zoomWidgetRect.bottom) + zoomWidgetRect.height + gap)) : margin;
    build.style.bottom = `${buildBottom}px`;
    build.style.maxBlockSize = `${Math.max(140, Math.floor(viewport.height * 0.30))}px`;
    build.style.overflowY = 'auto';
    build.style.overscrollBehavior = 'contain';
  }

  if (zoom) {
    zoom.style.right = `${margin}px`;
    const buildBottom = zoomWidgetRect ? Math.max(margin, Math.ceil((viewport.height - zoomWidgetRect.bottom) + zoomWidgetRect.height + gap)) : margin;
    const buildReservedHeight = Math.max(140, Math.floor(viewport.height * 0.30));
    zoom.style.bottom = `${buildBottom + buildReservedHeight + gap}px`;
    zoom.style.maxBlockSize = `${Math.max(140, Math.floor(viewport.height * 0.26))}px`;
    zoom.style.overflowY = 'auto';
    zoom.style.overscrollBehavior = 'contain';
  }

  return {
    build: build ? build.getBoundingClientRect() : null,
    zoom: zoom ? zoom.getBoundingClientRect() : null,
  };
}

function installDebugHudLayout() {
  if (window.__rfDebugHudLayoutInstalled) return;
  window.__rfDebugHudLayoutInstalled = true;

  const schedule = () => window.requestAnimationFrame(() => syncDebugHudStack());
  schedule();
  window.addEventListener('resize', schedule);
  if (window.visualViewport?.addEventListener) {
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }

  if (window.ResizeObserver) {
    const observer = new window.ResizeObserver(schedule);
    const build = document.getElementById('rf-build-debug');
    const zoom = document.getElementById('rf-zoom-live-debug');
    if (build) observer.observe(build);
    if (zoom) observer.observe(zoom);
    window.__rfDebugHudResizeObserver = observer;
  }
}

window.makePanelDraggable = makePanelDraggable;
window.syncDebugHudStack = syncDebugHudStack;
window.installDebugHudLayout = installDebugHudLayout;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installDebugHudLayout, { once: true });
} else {
  installDebugHudLayout();
}
