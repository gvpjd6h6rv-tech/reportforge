'use strict';
import { measureFileStructure } from './file_structure_signals.mjs';
import { measureFileBehavior } from './file_behavior_signals.mjs';
import { metricFileType } from '../metrics/metric_file_type.mjs';
import { computeFileMetricMargins } from '../scoring/metric_margin.mjs';
import { METRIC_MARGIN_POLICY } from '../scoring/metric_margin_policy.mjs';
import { scoreFile } from '../scoring/score_file.mjs';
import { scoreBehavior } from '../scoring/score_behavior.mjs';
import { scoreTotal } from '../scoring/score_total.mjs';
import { classifyLevel } from '../scoring/classify_level.mjs';
import { suggestSplit } from '../scoring/suggest_split.mjs';
import { buildReasons } from '../scoring/build_reasons.mjs';
import { resolveOwnerFromIndex } from '../ownership/ownership_resolver.mjs';

export function scoreFileResult({ file, ownershipIndex, root, config, baselineScore = null }) {
  const structure = measureFileStructure(file);
  const owner = resolveOwnerFromIndex(file, ownershipIndex, root);
  const fileType = metricFileType(file);
  const behavior = measureFileBehavior(structure.text, fileType, config, owner, structure.imports.value);

  const fileMetrics = {
    loc: structure.loc.value, complexity: structure.complexity.value, imports: structure.imports.value,
    functions: structure.functions.value, classes: structure.classes.value, nesting: structure.nesting.value,
    responsibilities: behavior.responsibilities.value.length, globals: behavior.globals.value,
    topLevelSideEffects: behavior.topLevel.value,
  };

  const spFileScore = Math.round(scoreFile(fileMetrics, config.weights.fileScore, config.caps));
  const spBehaviorScore = Math.round(scoreBehavior({
    ownershipViolation: behavior.ownershipViolation.value,
    roleViolation: behavior.roleViolation.value,
    crossLayerDependency: behavior.crossLayerDependency.value,
    hiddenSideEffect: behavior.hiddenSideEffect.value,
    coupling: behavior.coupling.value,
  }, config.weights.behaviorScore, config.caps));
  const spTotalScore = scoreTotal(spFileScore, spBehaviorScore, config.weights.totalScore);
  const level = classifyLevel(spTotalScore, config.levelScale);
  const metricMargins = computeFileMetricMargins({
    loc: structure.loc.value, loc_normalized: structure.locNormalized.value,
    complexity: structure.complexity.value, nesting: structure.nesting.value,
    sp_file_score: spFileScore, sp_behavior_score: spBehaviorScore,
    sp_total_score: spTotalScore, bytes: null,
  }, METRIC_MARGIN_POLICY, config.caps, baselineScore);

  const reasons = buildReasons([
    { rule: 'metric_loc', pass: structure.loc.value <= (config.caps.loc ?? Infinity), message: `${structure.loc.value} LOC`, evidence: structure.loc.evidence },
    { rule: 'check_ownership_violation', pass: !behavior.ownershipViolation.value, message: 'archivo no reclamado en ownership map', evidence: behavior.ownershipViolation.evidence },
    { rule: 'check_role_violation', pass: !behavior.roleViolation.value, message: 'responsabilidad detectada contradice el tipo de archivo', evidence: behavior.roleViolation.evidence },
    { rule: 'check_hidden_side_effect', pass: !behavior.hiddenSideEffect.value, message: 'efecto secundario a nivel de módulo', evidence: behavior.hiddenSideEffect.evidence },
    { rule: 'check_coupling', pass: behavior.coupling.evidence.length === 0, message: `${behavior.coupling.value} imports`, evidence: behavior.coupling.evidence },
  ]);

  return {
    path: file,
    owner,
    file_type: fileType,
    loc: structure.loc.value,
    loc_normalized: structure.locNormalized.value,
    loc_normalization_warning: structure.locNormalizationWarning.evidence,
    responsibilities_detected: behavior.responsibilities.value,
    sp_file_score: spFileScore,
    sp_behavior_score: spBehaviorScore,
    sp_total_score: spTotalScore,
    level,
    metric_margins: metricMargins,
    reasons,
    suggested_split: suggestSplit(behavior.responsibilities.value),
    violated_rules: reasons.map((r) => r.rule),
    evidence: reasons.flatMap((r) => r.evidence),
  };
}
