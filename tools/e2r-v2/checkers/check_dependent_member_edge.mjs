'use strict';
export const checkDependentMemberEdge = (input) => {
  const files = input?.capabilityMap?.capabilities?.[0]?.files || [];
  const edges = input?.moduleEdges || [];
  const memberPaths = new Set(files.filter((file) => file?.classification === 'GEOMETRY_MEMBER').map((file) => String(file?.path || '').replace(/\\/g, '/')));
  const violations = [];
  for (const file of files) {
    if (file?.classification !== 'GEOMETRY_DEPENDENT') continue;
    const pathValue = String(file?.path || '').replace(/\\/g, '/');
    const connected = edges.filter((edge) => String(edge?.from || '').replace(/\\/g, '/') === pathValue || String(edge?.to || '').replace(/\\/g, '/') === pathValue);
    file?.reviewedCandidateEvidence?.reviewDecision !== 'REVIEWED_DEPENDENT'
      ? violations.push(Object.fromEntries([['code', 'DEPENDENT_REVIEW_DECISION_INVALID'], ['path', pathValue]]))
      : connected.length && !connected.some((edge) => memberPaths.has(String(edge?.from || '').replace(/\\/g, '/')) || memberPaths.has(String(edge?.to || '').replace(/\\/g, '/')))
        && violations.push(Object.fromEntries([['code', 'DEPENDENT_MEMBER_EDGE_MISSING'], ['path', pathValue]]));
  }
  return Object.fromEntries([['name', 'check_dependent_member_edge'], ['value', violations.length === 0], ['evidence', Object.fromEntries([['violations', violations], ['total', files.filter((file) => file?.classification === 'GEOMETRY_DEPENDENT').length]])], ['diagnostics', violations]]);
};
