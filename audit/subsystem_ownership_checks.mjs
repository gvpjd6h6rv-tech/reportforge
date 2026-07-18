'use strict';
import { fileURLToPath } from 'node:url';
import { collectRuleExistErrors, checkFilesExist } from './subsystem_ownership_rule_paths.mjs';
import { collectOverlapErrors, collectOrphanWarnings } from './subsystem_ownership_rule_graph.mjs';
import { collectGuardErrors, collectSchemaErrors } from './subsystem_ownership_rule_metadata.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function evaluateOwnershipMap({ ownershipMap, root = ROOT }) {
  const subsystems = ownershipMap.subsystems || [];
  const { errors: existErrors, diskFiles } = collectRuleExistErrors(subsystems, root);
  const overlap = collectOverlapErrors(ownershipMap);
  const guardErrors = collectGuardErrors(subsystems);
  const schemaErrors = collectSchemaErrors(subsystems);
  const errors = [...existErrors, ...overlap.errors, ...guardErrors, ...schemaErrors];
  const warnings = collectOrphanWarnings({ diskFiles, claims: overlap.claims, sharedFiles: overlap.sharedFiles });
  return { errors, warnings, diskFiles, index: overlap };
}
