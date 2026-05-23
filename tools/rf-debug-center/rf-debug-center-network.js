'use strict';

import {
  buildNetworkSnapshot,
  buildNetworkSnapshotPublic,
  clearNetworkSnapshot,
  copyNetworkJSON,
  getNetworkObserverState,
  getNetworkSnapshot,
  refreshNetworkSnapshot,
  setNetworkObserverState,
  startRecord,
  short,
  textOrJson,
  trackRequest,
} from './rf-debug-center-network-core.js';

export {
  buildNetworkSnapshot,
  buildNetworkSnapshotPublic,
  clearNetworkSnapshot,
  copyNetworkJSON,
  getNetworkSnapshot,
  refreshNetworkSnapshot,
} from './rf-debug-center-network-core.js';

function summarizeFetchResponse(record, response) {
  const contentType = response?.headers?.get?.('content-type') || null;
  if (!response || response.type === 'opaque' || /(?:pdf|octet-stream|zip|audio|video|image|font|stream)/i.test(contentType || '')) {
    record.responseSummary = { kind: 'binary', contentType, unavailable: true };
    return;
  }
  let clone;
  try { clone = response.clone(); } catch (error) { record.responseSummary = { kind: 'response', contentType, cloneSkipped: true, error: short(error?.message || error) }; return; }
  void Promise.resolve().then(async () => {
    try {
      const text = await clone.text();
      record.responseSummary = { kind: 'text', value: textOrJson(text, record.sensitiveFieldsRedacted), truncated: text.length > 1000 };
    } catch (error) {
      record.responseSummary = { kind: 'response', contentType, unavailable: true, error: short(error?.message || error) };
    }
  });
}

function summarizeXhrResponse(xhr, record) {
  const contentType = xhr.getResponseHeader?.('content-type') || null;
  if (/pdf|octet-stream|zip|audio|video|image|font/i.test(contentType || '') || xhr.responseType === 'blob' || xhr.responseType === 'arraybuffer' || xhr.responseType === 'document') {
    record.responseSummary = { kind: 'binary', contentType, unavailable: true };
    return;
  }
  const value = xhr.responseType === 'json' && xhr.response != null ? xhr.response : xhr.responseText || '';
  record.responseSummary = { kind: xhr.responseType === 'json' ? 'json' : 'text', value: textOrJson(value, record.sensitiveFieldsRedacted), truncated: String(value).length > 1000 };
}

export function installNetworkObserver(win = typeof window !== 'undefined' ? window : null) {
  if (!win || getNetworkObserverState().installed) return buildNetworkSnapshot();
  let fetchOk = false;
  let xhrOk = false;
  try {
    if (typeof win.fetch === 'function' && !win.fetch.__rfDebugCenterNetworkWrapped) {
      const original = win.fetch;
      const wrapped = function (...args) {
        const input = args[0];
        const init = args[1] || {};
        const method = typeof input === 'object' && input?.method ? input.method : init.method || 'GET';
        const url = typeof input === 'object' && input?.url ? input.url : input;
        const headers = typeof input === 'object' && input?.headers ? input.headers : init.headers || null;
        const record = startRecord({ source: 'fetch', method, url, body: init.body ?? null, headers });
        return original.apply(this, args).then((response) => {
          trackRequest(record, { status: response?.status ?? null, ok: response?.ok ?? null, contentType: response?.headers?.get?.('content-type') || null });
          summarizeFetchResponse(record, response);
          return response;
        }, (error) => {
          trackRequest(record, { error: short(error?.stack || error?.message || error), status: 0, ok: false });
          throw error;
        });
      };
      wrapped.__rfDebugCenterNetworkWrapped = true;
      wrapped.__rfDebugCenterNetworkOriginal = original;
      win.fetch = wrapped;
      fetchOk = true;
    }
    const NativeXHR = win.XMLHttpRequest;
    if (typeof NativeXHR === 'function' && !NativeXHR.__rfDebugCenterNetworkWrapped) {
      const OriginalXHR = NativeXHR;
      function WrappedXHR() {
        const xhr = new OriginalXHR();
        let record = null;
        const open = xhr.open.bind(xhr);
        const send = xhr.send.bind(xhr);
        const setHeader = xhr.setRequestHeader?.bind(xhr);
        xhr.open = function (method, url, async, user, password) {
          xhr.__rfDebugCenterNetworkMeta = { method, url };
          return open(method, url, async, user, password);
        };
        xhr.send = function (body) {
          const meta = xhr.__rfDebugCenterNetworkMeta || {};
          record = startRecord({ source: 'xhr', method: meta.method || 'GET', url: meta.url || '', body, headers: null });
          xhr.addEventListener('loadend', () => {
            trackRequest(record, { status: xhr.status ?? null, ok: xhr.status >= 200 && xhr.status < 400, contentType: xhr.getResponseHeader?.('content-type') || null });
            summarizeXhrResponse(xhr, record);
          }, { once: true });
          return send(body);
        };
        xhr.setRequestHeader = function (name, value) { return setHeader ? setHeader(name, value) : undefined; };
        return xhr;
      }
      WrappedXHR.__rfDebugCenterNetworkWrapped = true;
      WrappedXHR.__rfDebugCenterNetworkOriginal = OriginalXHR;
      WrappedXHR.prototype = OriginalXHR.prototype;
      Object.setPrototypeOf(WrappedXHR, OriginalXHR);
      win.XMLHttpRequest = WrappedXHR;
      xhrOk = true;
    }
  } catch (error) {
    // Safe failure: keep the sidecar functional even if observation cannot be installed.
  }
  setNetworkObserverState({ installed: fetchOk || xhrOk, observerStatus: fetchOk && xhrOk ? 'installed' : fetchOk || xhrOk ? 'partial' : 'disabled', win, fetch: win.fetch?.__rfDebugCenterNetworkOriginal || null, xhr: win.XMLHttpRequest?.__rfDebugCenterNetworkOriginal || null, lastInstallAt: new Date().toISOString(), lastError: null });
  return buildNetworkSnapshot({ active: fetchOk || xhrOk });
}

export function uninstallNetworkObserver(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return buildNetworkSnapshot();
  const current = getNetworkObserverState();
  try { if (win.fetch && win.fetch.__rfDebugCenterNetworkWrapped && typeof win.fetch === 'function') win.fetch = current.fetch || win.fetch; } catch (_) {}
  try { if (win.XMLHttpRequest && win.XMLHttpRequest.__rfDebugCenterNetworkWrapped && typeof win.XMLHttpRequest === 'function') win.XMLHttpRequest = current.xhr || win.XMLHttpRequest; } catch (_) {}
  setNetworkObserverState({ installed: false, observerStatus: 'disabled', lastInstallAt: null });
  return buildNetworkSnapshot();
}
