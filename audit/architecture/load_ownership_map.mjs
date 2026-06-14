import fs from 'node:fs';

export function loadOwnershipMap(pathname = 'architecture/ownership-map.json') {
  const map = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  if (map.schema !== 'rf-architecture-ownership/v1') {
    throw new Error(`ownership map schema mismatch: ${map.schema}`);
  }
  return map;
}
