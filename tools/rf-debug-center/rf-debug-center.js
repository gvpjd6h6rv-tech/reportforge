import { createDebugCenterApi } from './rf-debug-center-api.js';

const center = createDebugCenterApi();
window.RFDebugCenter = center.api;

async function boot() {
  if (!document.body) {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
    return;
  }
  if (!center.api.start()) return;
  center.api.refresh();
}

boot();
