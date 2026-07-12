'use strict';
export function extractGlobalSymbolReferences(input = {}) {
  const source = typeof input === 'string' ? input : String(input?.source || input?.code || input?.text || '');
  const reads = [];
  const aliases = [];
  let dynamic = 0;
  let shadowed = false;
  for (const match of source.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)/g)) reads.push(`window.${match[1]}`);
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*window\b/g)) aliases.push(match[1]);
  for (const match of source.matchAll(/\bwindow\s*\[[^\]]+\]/g)) dynamic += 1;
  if (/\bfunction\s+[A-Za-z_$][\w$]*\s*\([^)]*\bwindow\b[^)]*\)/.test(source) || /\b(?:const|let|var|function)\s+window\b/.test(source)) shadowed = true;
  return { reads, aliases, dynamic, shadowed };
}
