'use strict';

function _hudHasStoredPosition(storageKey) {
  // Checks the `_userMoved` marker (set by BuildDebugPanel.js only on real
  // pointer displacement), NOT the raw position key — makePanelDraggable's
  // window-resize handler clamps+persists a position on every viewport
  // resize regardless of whether the user ever dragged anything, which
  // would otherwise be indistinguishable from a real user choice.
  try { return localStorage.getItem(`${storageKey}_userMoved`) !== null; } catch (_) { return false; }
}

function _hudViewportMetrics() {
  const vp = window.visualViewport || null;
  return {
    width: Math.max(0, Math.floor(vp?.width || window.innerWidth || document.documentElement.clientWidth || 0)),
    height: Math.max(0, Math.floor(vp?.height || window.innerHeight || document.documentElement.clientHeight || 0)),
    offsetLeft: Math.max(0, Math.floor(vp?.offsetLeft || 0)),
    offsetTop: Math.max(0, Math.floor(vp?.offsetTop || 0)),
  };
}

function syncDebugHudStack() {
  const build = document.getElementById('rf-build-debug');
  const zoom = document.getElementById('rf-zoom-live-debug');
  if (!build && !zoom) return null;

  const viewport = _hudViewportMetrics();
  const margin = 8;
  const gap = 8;
  const zoomWidget = document.getElementById('zoom-widget');
  const zoomWidgetRect = zoomWidget?.getBoundingClientRect?.() || null;

  // RF-FIELD-EXPLORER-OVERLAY-DRAG-1: engines/BuildDebugPanel.js wires
  // makePanelDraggable on both panels, which switches them to left/top
  // positioning (persisted in localStorage). Setting both left+right (or
  // top+bottom) on a width:auto/height:auto fixed element makes the
  // browser compute box size from the gap between them, squashing the
  // panel to a sliver — so once the user has actually dragged a panel
  // (a stored position exists), this stack-relative-to-zoom-widget
  // right/bottom math must stop touching it. But makePanelDraggable is
  // wired immediately on boot, before any drag happens, and its own
  // window-resize handler only clamps each panel independently to stay
  // on-screen — it has no notion of the OTHER panel, so on a viewport
  // shrink two independently-clamped-but-undragged panels can still
  // collide. Checking the actual stored position (not just whether drag
  // is wired) keeps this mutual-separation logic active for panels the
  // user never touched, across every resize, while still backing off the
  // moment there IS a real user-chosen position to respect.
  const buildPositioned = _hudHasStoredPosition('RF_BUILD_DEBUG_POS');
  const zoomPositioned = _hudHasStoredPosition('RF_ZOOM_DEBUG_POS');

  if (build) {
    if (!buildPositioned) {
      // makePanelDraggable (or its window-resize handler) may have already
      // set explicit left/top — clear them so only right/bottom govern the
      // box, otherwise left+right both being non-auto makes the browser
      // compute width from the gap between them instead of from content.
      build.style.left = 'auto';
      build.style.top = 'auto';
      build.style.right = `${margin}px`;
      const buildBottom = zoomWidgetRect ? Math.max(margin, Math.ceil((viewport.height - zoomWidgetRect.bottom) + zoomWidgetRect.height + gap)) : margin;
      build.style.bottom = `${buildBottom}px`;
    }
    build.style.maxBlockSize = `${Math.max(140, Math.floor(viewport.height * 0.30))}px`;
    build.style.overflowY = 'auto';
    build.style.overscrollBehavior = 'contain';
  }

  if (zoom) {
    if (!zoomPositioned) {
      zoom.style.left = 'auto';
      zoom.style.top = 'auto';
      zoom.style.right = `${margin}px`;
      const buildBottom = zoomWidgetRect ? Math.max(margin, Math.ceil((viewport.height - zoomWidgetRect.bottom) + zoomWidgetRect.height + gap)) : margin;
      const buildReservedHeight = Math.max(140, Math.floor(viewport.height * 0.30));
      zoom.style.bottom = `${buildBottom + buildReservedHeight + gap}px`;
    }
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

window.syncDebugHudStack = syncDebugHudStack;
window.installDebugHudLayout = installDebugHudLayout;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installDebugHudLayout, { once: true });
} else {
  installDebugHudLayout();
}
