'use strict';

import { clearDomScannerSnapshot, copyDomScannerJSON, getDomScannerSnapshot, refreshDomScannerSnapshot } from './rf-debug-center-dom-scanner.js';

export function applyDomScannerApi(api, state, applyModel) {
  const refreshDomScanner = () => { refreshDomScannerSnapshot({ ds: typeof DS !== 'undefined' ? DS : null, doc: document, bundle: state.bundle, ownership: window.RFDebugCenter?.ownership || null }); return applyModel(); };
  const clearDomScanner = () => { clearDomScannerSnapshot(); return applyModel(); };
  const copyDomScannerJSONPublic = () => copyDomScannerJSON();
  const getDomScannerSnapshotPublic = () => getDomScannerSnapshot();
  Object.assign(api, { refreshDomScanner, clearDomScanner, copyDomScannerJSON: copyDomScannerJSONPublic, getDomScannerSnapshot: getDomScannerSnapshotPublic });
  state.actions = { ...(state.actions || {}), refreshDomScanner, clearDomScanner, copyDomScannerJSON: copyDomScannerJSONPublic, getDomScannerSnapshot: getDomScannerSnapshotPublic };
  return api;
}
