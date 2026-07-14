'use strict';
const checkMapEntryNonexistentFile = (await import('../checkers/check_map_entry_nonexistent_file.mjs')).checkMapEntryNonexistentFile;
const checkDependentMemberEdge = (await import('../checkers/check_dependent_member_edge.mjs')).checkDependentMemberEdge;
const checkExcludedNewGeometrySignal = (await import('../checkers/check_excluded_new_geometry_signal.mjs')).checkExcludedNewGeometrySignal;
const checkBfsMapDrift = (await import('../checkers/check_bfs_map_drift.mjs')).checkBfsMapDrift;
export const buildValidationGraphChecks = (input) => Object.fromEntries([
  ['nonexistentMapEntry', checkMapEntryNonexistentFile(Object.fromEntries([['capabilityMap', input?.report?.capabilityMap], ['root', input?.report?.root]]))],
  ['dependentMemberEdge', checkDependentMemberEdge(Object.fromEntries([['capabilityMap', input?.report?.capabilityMap], ['moduleEdges', (input?.evidence?.moduleEdges || []).flatMap((row) => row.edges || [])]]))],
  ['excludedNewGeometrySignal', checkExcludedNewGeometrySignal(Object.fromEntries([['capabilityMap', input?.report?.capabilityMap], ['moduleEdges', (input?.evidence?.moduleEdges || []).flatMap((row) => row.edges || [])]]))],
  ['bfsMapDrift', checkBfsMapDrift(Object.fromEntries([['bfsCandidates', input?.report?.bfsCandidates || []], ['reviewedBfsCandidates', input?.report?.reviewedBfsCandidates || []]]))],
]);
