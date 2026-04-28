'use strict';

const SnapGuides = (() => {
  function getAlignmentGuides(movingEl, threshold = 4) {
    if (typeof AlignmentGeometry === 'undefined') return [];
    return AlignmentGeometry.compute(movingEl, threshold).guides || [];
  }

  return { getAlignmentGuides };
})();

if (typeof module !== 'undefined') module.exports = SnapGuides;
