'use strict';
import { fileURLToPath } from 'node:url';
import { collectEngineExistErrors } from './subsystem_ownership_rule_engine_paths.mjs';
import { collectRepoPathExistErrors } from './subsystem_ownership_rule_repo_paths.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function checkFilesExist(subsystems, diskFiles) {
  const errors = [];
  for (const ss of subsystems) {
    for (const f of (ss.allowedFiles || [])) {
      if (!diskFiles.has(f)) {
        errors.push({
          rule: 'RULE-EXIST',
          subsystem: ss.id,
          file: f,
          detail: `engines/${f} does not exist on disk`,
        });
      }
    }
  }
  return errors;
}

export function collectRuleExistErrors(subsystems, root = ROOT) {
  const engine = collectEngineExistErrors(subsystems);
  const repo = collectRepoPathExistErrors(subsystems, root);
  return { errors: [...engine.errors, ...repo.errors], diskFiles: engine.diskFiles };
}
