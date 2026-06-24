'use strict';
window.RF_BUILD_INFO = {
  commit: '__RF_BUILD_COMMIT__',
  assetVersion: '__RF_BUILD_ASSET_VERSION__',
  htmlTimestamp: '__RF_BUILD_HTML_TIMESTAMP__',
  jsTimestamp: '__RF_BUILD_JS_TIMESTAMP__',
  jsRoute: '__RF_BUILD_JS_ROUTE__',
  cacheStatus: '__RF_BUILD_CACHE_STATUS__',
  htmlRoute: '__RF_BUILD_HTML_ROUTE__'
};
window.RF_REFRESH_BUILD_DEBUG = function() {
  const info = window.RF_BUILD_INFO || {};
  const commit = document.getElementById('rf-build-commit');
  const asset = document.getElementById('rf-build-asset');
  const htmlts = document.getElementById('rf-build-htmlts');
  const js = document.getElementById('rf-build-js');
  const jsts = document.getElementById('rf-build-jsts');
  const cache = document.getElementById('rf-build-cache');
  if (commit) commit.textContent = `commit ${info.commit || 'unknown'}`;
  if (asset) asset.textContent = `asset ${info.assetVersion || 'unknown'}`;
  if (htmlts) htmlts.textContent = `html ${info.htmlTimestamp || 'unknown'}`;
  if (js) js.textContent = info.jsRoute || 'js unknown';
  if (jsts) jsts.textContent = `js ${info.jsTimestamp || 'unknown'}`;
  if (cache) cache.textContent = `cache ${info.cacheStatus || 'unknown'}`;
};
window.RF_REFRESH_ZOOM_DEBUG_PANEL = function() {
  const info = window.RF_DEBUG_ZOOM || {};
  const zoom = document.getElementById('rf-zd-zoom');
  const slider = document.getElementById('rf-zd-slider');
  const pct = document.getElementById('rf-zd-pct');
  const tb = document.getElementById('rf-zd-tb');
  const event = document.getElementById('rf-zd-event');
  const fn = document.getElementById('rf-zd-fn');
  if (zoom) zoom.textContent = String(info.zoom ?? '');
  if (slider) slider.textContent = String(info.sliderValue ?? '');
  if (pct) pct.textContent = String(info.pctText ?? '');
  if (tb) tb.textContent = String(info.tbValue ?? '');
  if (event) event.textContent = String(info.lastEvent ?? '');
  if (fn) fn.textContent = String(info.lastFunction ?? '');
};
window.RF_REFRESH_BUILD_DEBUG();
window.RF_REFRESH_ZOOM_DEBUG_PANEL();

// RF-FIELD-EXPLORER-OVERLAY-DRAG-1: these two panels are position:fixed,
// anchored bottom-right by CSS — at narrow viewport widths (or whenever a
// floating panel like the Field Explorer ends up near that corner) they
// visually collide with it. Reusing engines/DebugPanelUtils.js's
// makePanelDraggable (the same utility DebugOverlay.js already uses) gives
// drag-from-header + viewport clamping + position persistence without a
// second implementation.
//
// engines/DebugHudLayout.js (loaded just before this file) already
// computes a no-overlap default position for these two panels relative to
// the zoom-widget — run it once synchronously first so the position
// makePanelDraggable captures as its "no stored position yet" default is
// that already-non-overlapping layout, not the raw CSS right/bottom
// anchor. DebugHudLayout.js backs off repositioning a panel once the user
// has REALLY dragged it (a `${storageKey}_userMoved` marker, set below on
// real pointer displacement) — NOT just whenever a stored position exists,
// since makePanelDraggable's own window-resize handler clamps+persists a
// position on every viewport resize even without any drag, which would
// otherwise look identical to "user positioned" and permanently disable
// the mutual-separation logic the very first time the window resizes.
function _setupDraggableDebugPanel(panelId, headId, collapseId, storageKey) {
  const panel = document.getElementById(panelId);
  const head = document.getElementById(headId);
  const collapseBtn = document.getElementById(collapseId);
  if (!panel || !head || typeof window.makePanelDraggable !== 'function') return;
  window.syncDebugHudStack?.();
  window.makePanelDraggable(panel, head, storageKey, { left: panel.offsetLeft, top: panel.offsetTop });
  let downPos = null;
  head.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
  head.addEventListener('pointerup', (e) => {
    if (downPos && (Math.abs(e.clientX - downPos.x) > 3 || Math.abs(e.clientY - downPos.y) > 3)) {
      try { localStorage.setItem(`${storageKey}_userMoved`, '1'); } catch (_) {}
    }
    downPos = null;
  });
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      const collapsed = panel.dataset.collapsed === 'true';
      panel.dataset.collapsed = collapsed ? 'false' : 'true';
      collapseBtn.textContent = collapsed ? '−' : '+';
      collapseBtn.title = collapsed ? 'Minimizar' : 'Restaurar';
    });
  }
}
// Deferred to the next animation frame — matches DebugHudLayout.js's own
// schedule(). Reading offsetLeft/offsetTop here forces a synchronous
// layout reflow; doing that at synchronous script-parse time (this file
// loads near the end of body, but still before later boot scripts finish)
// was shifting the timing of unrelated initial rendering enough to leave
// a stale partially-painted #workspace region in screenshot-based tests.
window.requestAnimationFrame(() => {
  _setupDraggableDebugPanel('rf-build-debug', 'rf-build-debug-head', 'rf-build-debug-collapse', 'RF_BUILD_DEBUG_POS');
  _setupDraggableDebugPanel('rf-zoom-live-debug', 'rf-zoom-live-debug-head', 'rf-zoom-live-debug-collapse', 'RF_ZOOM_DEBUG_POS');
});
