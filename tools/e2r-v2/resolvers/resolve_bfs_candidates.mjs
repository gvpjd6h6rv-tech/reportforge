'use strict';
export function resolveBfsCandidates(graph = [], seeds = [], boundaryDepth = 2) {
  const edges = Array.isArray(graph) ? graph : Array.isArray(graph?.edges) ? graph.edges : [];
  const startSeeds = Array.isArray(seeds) ? seeds : Array.isArray(seeds?.seeds) ? seeds.seeds : [];
  const adjacency = new Map();
  for (const edge of edges) {
    const from = edge.from ?? edge.source ?? edge.node ?? null;
    const to = edge.to ?? edge.target ?? edge.neighbor ?? null;
    if (!from || !to) continue;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  }
  const best = new Map();
  const queue = [];
  for (const seed of startSeeds) {
    const node = seed.path ?? seed.node ?? seed.from ?? seed.id ?? null;
    if (!node) continue;
    if (!best.has(node) || 0 < best.get(node)) best.set(node, 0);
    queue.push({ node, distance: 0 });
  }
  while (queue.length) {
    const current = queue.shift();
    const nextDistance = current.distance + 1;
    if (nextDistance >= boundaryDepth) continue;
    for (const neighbor of adjacency.get(current.node) || []) {
      const known = best.get(neighbor);
      if (known !== undefined && known <= nextDistance) continue;
      best.set(neighbor, nextDistance);
      queue.push({ node: neighbor, distance: nextDistance });
    }
  }
  return [...best.entries()].map(([node, distance]) => ({ node, distance })).sort((a, b) => a.distance - b.distance || a.node.localeCompare(b.node));
}
