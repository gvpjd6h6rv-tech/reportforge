'use strict';

const LAYER_ORDER = ['contracts', 'collectors', 'metrics', 'normalizers', 'checkers', 'scoring', 'reporters', 'runner', 'bin'];

/** RULE: a layer must only import from itself or a layer earlier in LAYER_ORDER, never a later one. */
export function checkNoCrossLayerImports(filePath, text) {
  const layerOf = (p) => LAYER_ORDER.find((l) => p.includes(`/${l}/`));
  const ownLayer = layerOf(filePath);
  const violations = [];

  if (ownLayer) {
    const imports = text.match(/from\s+['"]([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      const targetLayer = LAYER_ORDER.find((l) => imp.includes(`/${l}/`));
      if (targetLayer && LAYER_ORDER.indexOf(targetLayer) > LAYER_ORDER.indexOf(ownLayer)) {
        violations.push(`${filePath}: imports from higher layer "${targetLayer}" (${imp})`);
      }
    }
  }

  return { value: violations.length === 0, evidence: violations };
}
