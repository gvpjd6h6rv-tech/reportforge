'use strict';

/** Magnitude signal (not boolean): how many distinct modules this file imports, regardless of layer correctness. */
export function checkCoupling(importsValue = 0, cap = 10) {
  const evidence = importsValue > cap ? [`${importsValue} imports > cap ${cap}`] : [];
  return { value: importsValue, evidence };
}
