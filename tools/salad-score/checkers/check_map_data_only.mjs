'use strict';

/** RULE: maps/*.json must be valid, parseable JSON — data only, never code. */
export function checkMapDataOnly(filePath, text) {
  const evidence = [];
  let pass = true;
  try {
    JSON.parse(text);
  } catch (err) {
    pass = false;
    evidence.push(`${filePath}: invalid JSON — ${err.message}`);
  }
  return { value: pass, evidence };
}
