'use strict';
export function buildGlobalSymbolRegistry(input = {}) {
  const files = Array.isArray(input) ? input : Array.isArray(input?.files) ? input.files : [];
  const symbols = new Map();
  for (const file of files) {
    for (const symbol of file?.reads || []) symbols.set(symbol, (symbols.get(symbol) || 0) + 1);
    for (const symbol of file?.aliases || []) symbols.set(symbol, (symbols.get(symbol) || 0) + 1);
  }
  return {
    symbols: Object.fromEntries(symbols),
    providers: files.map((file) => ({ path: file.path || file.relative || null, kind: file.kind || 'UNKNOWN' })),
  };
}
