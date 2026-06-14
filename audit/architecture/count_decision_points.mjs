export function countDecisionPoints(text) {
  const matches = text.match(/\b(if|for|while|case|catch|switch)\b|&&|\|\||\?/g);
  return matches ? matches.length : 0;
}
