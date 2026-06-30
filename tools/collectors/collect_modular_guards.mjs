'use strict';
/**
 * Collect modular guards eligible to run:
 * guards-map.json entries where state=existing, layer=guard, pathCurrent set.
 */
export function collectModularGuards(map) {
  return map.entries.filter(e =>
    e.layer === 'guard' &&
    e.state === 'existing' &&
    e.pathCurrent &&
    e.pathCurrent.startsWith('tools/guards/')
  );
}
