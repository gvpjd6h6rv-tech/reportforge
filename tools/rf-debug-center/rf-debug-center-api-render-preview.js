'use strict';

import { clearDebugCenterRenderPreview, copyDebugCenterRenderPreviewJSON, refreshDebugCenterRenderPreview } from './rf-debug-center-store.js';

export function applyRenderPreviewApi(api, state, applyModel) {
  const refreshRenderPreview = () => { refreshDebugCenterRenderPreview(window.RF_UI_TRACE, state.bundlePreview || state.bundle, state.enabled); return applyModel(); };
  const clearRenderPreview = () => { clearDebugCenterRenderPreview(); return applyModel(); };
  const copyRenderPreviewJSONPublic = () => copyDebugCenterRenderPreviewJSON();
  Object.assign(api, { refreshRenderPreview, clearRenderPreview, copyRenderPreviewJSON: copyRenderPreviewJSONPublic });
  state.actions = { ...(state.actions || {}), refreshRenderPreview, clearRenderPreview, copyRenderPreviewJSON: copyRenderPreviewJSONPublic };
  return api;
}
