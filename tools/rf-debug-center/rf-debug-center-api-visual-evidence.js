'use strict';
import { captureVisualEvidence, clearVisualEvidence, copyVisualEvidenceJSON, getVisualEvidenceSnapshot } from './rf-debug-center-visual-evidence.js';

export function applyVisualEvidenceApi(api, state, applyModel) {
  const capture = (target) => {
    captureVisualEvidence(target, { doc: typeof document !== 'undefined' ? document : null, win: typeof window !== 'undefined' ? window : null });
    return applyModel();
  };
  const clear = () => { clearVisualEvidence(); return applyModel(); };
  const copyJSON = () => copyVisualEvidenceJSON();
  const getSnapshot = () => getVisualEvidenceSnapshot();
  Object.assign(api, { captureVisualEvidence: capture, clearVisualEvidence: clear, copyVisualEvidenceJSON: copyJSON, getVisualEvidenceSnapshot: getSnapshot });
  state.actions = { ...(state.actions || {}), captureVisualEvidence: capture, clearVisualEvidence: clear, copyVisualEvidenceJSON: copyJSON, getVisualEvidenceSnapshot: getSnapshot };
  return api;
}
