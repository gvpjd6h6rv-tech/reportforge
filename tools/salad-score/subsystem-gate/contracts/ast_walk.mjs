'use strict';
/** Shared AST traversal utility: visits every node in an acorn AST,
 *  calling fn(node) on each. Single responsibility: tree traversal --
 *  no rule logic of its own. */
export function astWalk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const key in node) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const c = node[key];
    if (Array.isArray(c)) c.forEach((x) => astWalk(x, fn));
    else if (c && typeof c === 'object') astWalk(c, fn);
  }
}
