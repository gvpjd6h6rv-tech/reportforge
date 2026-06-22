'use strict';
import fs from 'node:fs';

/** Reads one file from disk. The only place in metrics/checkers' upstream that touches fs for content. */
export function collectFileText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}
