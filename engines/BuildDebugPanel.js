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
