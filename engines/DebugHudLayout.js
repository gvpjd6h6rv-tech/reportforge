'use strict';

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

window.syncDebugHudStack = syncDebugHudStack;
window.installDebugHudLayout = installDebugHudLayout;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installDebugHudLayout, { once: true });
} else {
  installDebugHudLayout();
}
