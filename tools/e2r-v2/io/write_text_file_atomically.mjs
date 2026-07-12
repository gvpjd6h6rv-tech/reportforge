'use strict';
import fs from 'node:fs';
import path from 'node:path';
export function writeTextFileAtomically(filePath, text) {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const temp = `${abs}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, abs);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return abs;
}
