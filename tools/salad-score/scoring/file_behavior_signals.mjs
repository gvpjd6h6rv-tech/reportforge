'use strict';
import { metricResponsibilities } from '../metrics/metric_responsibilities.mjs';
import { metricGlobals } from '../metrics/metric_globals.mjs';
import { metricTopLevelSideEffects } from '../metrics/metric_top_level_side_effects.mjs';
import { checkOwnershipViolation } from '../checkers/check_ownership_violation.mjs';
import { checkRoleViolation } from '../checkers/check_role_violation.mjs';
import { checkCrossLayerDependency } from '../checkers/check_cross_layer_dependency.mjs';
import { checkHiddenSideEffect } from '../checkers/check_hidden_side_effect.mjs';
import { checkCoupling } from '../checkers/check_coupling.mjs';

export function measureFileBehavior(text, fileType, config, owner, importsValue) {
  const responsibilities = metricResponsibilities(text);
  const globals = metricGlobals(text, config.globalIdentifiers);
  const topLevel = metricTopLevelSideEffects(text);
  const ownershipViolation = checkOwnershipViolation(owner);
  const roleViolation = checkRoleViolation(fileType, responsibilities.value);
  const crossLayerDependency = checkCrossLayerDependency([], [], []);
  const hiddenSideEffect = checkHiddenSideEffect(topLevel);
  const coupling = checkCoupling(importsValue, config.caps.imports);

  return {
    responsibilities,
    globals,
    topLevel,
    ownershipViolation,
    roleViolation,
    crossLayerDependency,
    hiddenSideEffect,
    coupling,
  };
}
