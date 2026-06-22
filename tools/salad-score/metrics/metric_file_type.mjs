'use strict';

/** Classifies a file by path pattern. Does not feed any score — feeds output contract's file_type only. */
export function metricFileType(filePath) {
  if (filePath.includes('/engines/')) return 'engine';
  if (filePath.includes('/tools/')) return 'tool';
  if (filePath.includes('/reportforge/tests/') || filePath.endsWith('.test.mjs')) return 'test';
  if (filePath.includes('/audit/')) return 'guard';
  if (filePath.endsWith('.json') || filePath.includes('config')) return 'config';
  return 'other';
}
