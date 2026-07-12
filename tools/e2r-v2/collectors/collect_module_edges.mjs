'use strict';
import { buildModuleEdges } from '../graph/build_module_edges.mjs';
import { filterGeometryCandidateEdges } from '../graph/filter_geometry_candidate_edges.mjs';

export function collectModuleEdges(input = {}) {
  const files = Array.isArray(input) ? input : Array.isArray(input?.physical) ? input.physical : [];
  const edgesByPath = [];
  for (const file of files) {
    const graph = buildModuleEdges({ files: [file] }).edges;
    edgesByPath.push({ path: file.relative || file.path || null, edges: filterGeometryCandidateEdges(graph) });
  }
  return edgesByPath;
}
