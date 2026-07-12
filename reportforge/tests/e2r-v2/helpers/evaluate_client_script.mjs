'use strict';
import vm from 'node:vm';
export function evaluateClientScript(script, document = createDocument()) {
  const context = vm.createContext({ document, window: { document }, console });
  vm.runInContext(script, context);
  return document;
}
function createDocument() {
  const listeners = new Map();
  const rows = [];
  const table = { tBodies: [{ rows }] };
  const input = { value: '', addEventListener(type, fn) { listeners.set(type, fn); }, dispatch(type) { listeners.get(type)?.(); } };
  const document = { getElementById(id) { return id === 'search' ? input : id === 'members' ? table : null; } };
  rows.push({ dataset: { path: 'engines/GeometryCore.js' }, hidden: false }, { dataset: { path: 'engines/SelectionState.js' }, hidden: false });
  return document;
}
