'use strict';
import fs from 'node:fs';
import { collectFileList } from '../collectors/collect_file_list.mjs';
import { collectFileText } from '../collectors/collect_file_text.mjs';
import { collectOwner } from '../collectors/collect_owner.mjs';
import { metricLoc } from '../metrics/metric_loc.mjs';
import { metricComplexity } from '../metrics/metric_complexity.mjs';
import { metricImports } from '../metrics/metric_imports.mjs';
import { metricFunctions } from '../metrics/metric_functions.mjs';
import { metricClasses } from '../metrics/metric_classes.mjs';
import { metricNesting } from '../metrics/metric_nesting.mjs';
import { metricResponsibilities } from '../metrics/metric_responsibilities.mjs';
import { metricGlobals } from '../metrics/metric_globals.mjs';
import { metricTopLevelSideEffects } from '../metrics/metric_top_level_side_effects.mjs';
import { metricFileType } from '../metrics/metric_file_type.mjs';
import { checkOwnershipViolation } from '../checkers/check_ownership_violation.mjs';
import { checkRoleViolation } from '../checkers/check_role_violation.mjs';
import { checkCrossLayerDependency } from '../checkers/check_cross_layer_dependency.mjs';
import { checkHiddenSideEffect } from '../checkers/check_hidden_side_effect.mjs';
import { checkCoupling } from '../checkers/check_coupling.mjs';
import { scoreFile } from '../scoring/score_file.mjs';
import { scoreBehavior } from '../scoring/score_behavior.mjs';
import { scoreTotal } from '../scoring/score_total.mjs';
import { scoreRepo } from '../scoring/score_repo.mjs';
import { classifyLevel } from '../scoring/classify_level.mjs';
import { suggestSplit } from '../scoring/suggest_split.mjs';
import { buildReasons } from '../scoring/build_reasons.mjs';

/** Pure orchestration: collectors -> metrics -> checkers -> scoring, per file, then repo aggregate. No formulas live here. */
export function runSaladScore({ roots, config, ownershipMapPath }) {
  const fileSet = new Set();
  for (const root of roots) {
    for (const f of collectFileList(root, config.excludedDirs)) fileSet.add(f);
  }
  const files = [...fileSet].sort();
  const ownershipMap = JSON.parse(fs.readFileSync(ownershipMapPath, 'utf8'));
  const results = [];

  for (const file of files) {
    const text = collectFileText(file);
    const owner = collectOwner(file, ownershipMap);
    const fileType = metricFileType(file);

    const loc = metricLoc(text);
    const complexity = metricComplexity(text);
    const imports = metricImports(text);
    const fns = metricFunctions(text);
    const classes = metricClasses(text);
    const nesting = metricNesting(text);
    const responsibilities = metricResponsibilities(text);
    const globals = metricGlobals(text, config.globalIdentifiers);
    const topLevel = metricTopLevelSideEffects(text);

    const fileMetrics = {
      loc: loc.value, complexity: complexity.value, imports: imports.value,
      functions: fns.value, classes: classes.value, nesting: nesting.value,
      responsibilities: responsibilities.value.length, globals: globals.value,
      topLevelSideEffects: topLevel.value,
    };

    const ownershipViolation = checkOwnershipViolation(owner);
    const roleViolation = checkRoleViolation(fileType, responsibilities.value);
    const crossLayerDependency = checkCrossLayerDependency([], [], []);
    const hiddenSideEffect = checkHiddenSideEffect(topLevel);
    const coupling = checkCoupling(imports.value, config.caps.imports);

    const behaviorSignals = {
      ownershipViolation: ownershipViolation.value,
      roleViolation: roleViolation.value,
      crossLayerDependency: crossLayerDependency.value,
      hiddenSideEffect: hiddenSideEffect.value,
      coupling: coupling.value,
    };

    const spFileScore = Math.round(scoreFile(fileMetrics, config.weights.fileScore, config.caps));
    const spBehaviorScore = Math.round(scoreBehavior(behaviorSignals, config.weights.behaviorScore, config.caps));
    const spTotalScore = scoreTotal(spFileScore, spBehaviorScore, config.weights.totalScore);
    const level = classifyLevel(spTotalScore, config.levelScale);

    const reasons = buildReasons([
      { rule: 'metric_loc', pass: loc.value <= (config.caps.loc ?? Infinity), message: `${loc.value} LOC`, evidence: loc.evidence },
      { rule: 'check_ownership_violation', pass: !ownershipViolation.value, message: 'archivo no reclamado en ownership map', evidence: ownershipViolation.evidence },
      { rule: 'check_role_violation', pass: !roleViolation.value, message: 'responsabilidad detectada contradice el tipo de archivo', evidence: roleViolation.evidence },
      { rule: 'check_hidden_side_effect', pass: !hiddenSideEffect.value, message: 'efecto secundario a nivel de módulo', evidence: hiddenSideEffect.evidence },
      { rule: 'check_coupling', pass: coupling.evidence.length === 0, message: `${coupling.value} imports`, evidence: coupling.evidence },
    ]);

    results.push({
      path: file,
      owner,
      file_type: fileType,
      loc: loc.value,
      responsibilities_detected: responsibilities.value,
      sp_file_score: spFileScore,
      sp_behavior_score: spBehaviorScore,
      sp_total_score: spTotalScore,
      level,
      reasons,
      suggested_split: suggestSplit(responsibilities.value),
      violated_rules: reasons.map((r) => r.rule),
      evidence: reasons.flatMap((r) => r.evidence),
    });
  }

  return { repoScore: scoreRepo(results), files: results };
}
