'use strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRepoPathClaims } from './subsystem_ownership_rule_repo_claims.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function collectRepoPathExistErrors(subsystems, root = ROOT) {
  const { claims, errors } = collectRepoPathClaims(subsystems);
  for (const claim of claims) {
    if (!existsSync(join(root, claim.rel))) {
      errors.push({ rule: 'RULE-EXIST', subsystem: claim.subsystem, file: claim.rel, detail: `${claim.rel} does not exist on disk` });
    }
  }
  return { errors };
}
