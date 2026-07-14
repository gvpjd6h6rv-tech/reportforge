'use strict';
export const checkExcludedNewGeometrySignal = (input) => {
  const files = input?.capabilityMap?.capabilities?.[0]?.files || [];
  const edges = input?.moduleEdges || [];
  const memberPaths = new Set(files.filter((file) => file?.classification === 'GEOMETRY_MEMBER').map((file) => String(file?.path || '').replace(/\\/g, '/')));
  const violations = [];
  for (const file of files) {
    if (file?.classification !== 'GEOMETRY_EXCLUDED') continue;
    const pathValue = String(file?.path || '').replace(/\\/g, '/');
    const connected = edges.filter((edge) => String(edge?.from || '').replace(/\\/g, '/') === pathValue || String(edge?.to || '').replace(/\\/g, '/') === pathValue);
    file?.reviewedCandidateEvidence?.reviewDecision !== 'REVIEWED_EXCLUDED' && violations.push(Object.fromEntries([['code', 'EXCLUDED_REVIEW_DECISION_INVALID'], ['path', pathValue]]));
    !String(file?.semanticContractRule || '').startsWith('GX-') && violations.push(Object.fromEntries([['code', 'EXCLUDED_SEMANTIC_RULE_INVALID'], ['path', pathValue]]));
    connected.some((edge) => memberPaths.has(String(edge?.from || '').replace(/\\/g, '/')) || memberPaths.has(String(edge?.to || '').replace(/\\/g, '/'))) && violations.push(Object.fromEntries([['code', 'EXCLUDED_MEMBER_SIGNAL_PRESENT'], ['path', pathValue]]));
  }
  return Object.fromEntries([['name', 'check_excluded_new_geometry_signal'], ['value', violations.length === 0], ['evidence', Object.fromEntries([['violations', violations], ['total', files.filter((file) => file?.classification === 'GEOMETRY_EXCLUDED').length]])], ['diagnostics', violations]]);
};
