'use strict';
import { clearCausalIntelligenceSnapshot, copyCausalIntelligenceJSON, getCausalIntelligenceSnapshot, refreshCausalIntelligenceSnapshot } from './rf-debug-center-causal-intelligence.js';

export function applyCausalIntelligenceApi(api, state, applyModel) {
  state.actions.refreshCausalIntelligence = () => { refreshCausalIntelligenceSnapshot(state.lastModel || applyModel()); return applyModel(); };
  state.actions.clearCausalIntelligence = () => { clearCausalIntelligenceSnapshot(); return applyModel(); };
  state.actions.copyCausalIntelligenceJSON = () => copyCausalIntelligenceJSON();
  api.refreshCausalIntelligence = state.actions.refreshCausalIntelligence;
  api.clearCausalIntelligence = state.actions.clearCausalIntelligence;
  api.copyCausalIntelligenceJSON = state.actions.copyCausalIntelligenceJSON;
  api.getCausalIntelligenceSnapshot = () => getCausalIntelligenceSnapshot();
}
