'use strict';

import { clearDebugCenterSelection, copyDebugCenterSelectionJSON, refreshDebugCenterSelection } from './rf-debug-center-store.js';

export function applySelectionApi(api, state, applyModel) {
  const refreshSelection = () => { refreshDebugCenterSelection(window.RF_UI_TRACE, state.bundle); return applyModel(); };
  const clearSelection = () => { clearDebugCenterSelection(); return applyModel(); };
  const copySelectionJSON = () => copyDebugCenterSelectionJSON();
  Object.assign(api, { refreshSelection, clearSelection, copySelectionJSON });
  state.actions = { ...(state.actions || {}), refreshSelection, clearSelection, copySelectionJSON };
  return api;
}
