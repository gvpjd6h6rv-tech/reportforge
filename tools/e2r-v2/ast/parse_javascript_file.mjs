'use strict';
import fs from 'node:fs';
import path from 'node:path';

function readSource(input) {
  if (typeof input === 'string' && fs.existsSync(input)) {
    return { path: path.resolve(input), source: fs.readFileSync(input, 'utf8') };
  }
  if (typeof input === 'string') return { path: null, source: input };
  if (input && typeof input === 'object') {
    if (typeof input.source === 'string') return { path: input.path || null, source: input.source };
    if (typeof input.code === 'string') return { path: input.path || null, source: input.code };
    if (typeof input.text === 'string') return { path: input.path || null, source: input.text };
  }
  return { path: null, source: '' };
}

export function parseJavaScriptFile(input = {}) {
  const { path: filePath, source } = readSource(input);
  const moduleLike = /\b(?:import|export)\b/.test(source);
  return {
    filePath,
    source,
    sourceType: moduleLike ? 'module' : 'script',
    ok: true,
  };
}

export const parseJavascriptFile = parseJavaScriptFile;
