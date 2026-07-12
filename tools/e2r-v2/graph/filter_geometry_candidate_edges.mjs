'use strict';
export function filterGeometryCandidateEdges(input = {}) {
  const edges = Array.isArray(input) ? input : Array.isArray(input?.edges) ? input.edges : [];
  return edges.filter((edge) => edge && edge.from && edge.to && edge.from !== edge.to && !/generic|hub/i.test(`${edge.from} ${edge.to}`));
}
