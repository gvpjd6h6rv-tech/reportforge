export function classifyVisualEvidence({
  verified = false,
  related = true,
  measurable = false,
  culprit = null,
} = {}) {
  if (!related) return 'BACKLOG';
  if (verified && measurable && culprit) return 'ROOT_CAUSE';
  if (verified || measurable) return 'CANDIDATE';
  return 'BACKLOG';
}
