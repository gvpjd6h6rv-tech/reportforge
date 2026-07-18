'use strict';
import { collectFileText } from '../collectors/collect_file_text.mjs';
import { metricLoc } from '../metrics/metric_loc.mjs';
import { metricLocNormalized } from '../metrics/metric_loc_normalized.mjs';
import { metricComplexity } from '../metrics/metric_complexity.mjs';
import { metricImports } from '../metrics/metric_imports.mjs';
import { metricFunctions } from '../metrics/metric_functions.mjs';
import { metricClasses } from '../metrics/metric_classes.mjs';
import { metricNestingNormalized } from '../metrics/metric_nesting_normalized.mjs';
import { checkLocNormalizationWarning } from '../checkers/check_loc_normalization_warning.mjs';

export function measureFileStructure(file) {
  const text = collectFileText(file);
  const loc = metricLoc(text);
  const locNormalized = metricLocNormalized(text);
  const complexity = metricComplexity(text);
  const imports = metricImports(text);
  const functions = metricFunctions(text);
  const classes = metricClasses(text);
  const nesting = metricNestingNormalized(text);
  const locNormalizationWarning = checkLocNormalizationWarning(loc.value, locNormalized.value);

  return {
    text,
    loc,
    locNormalized,
    complexity,
    imports,
    functions,
    classes,
    nesting,
    locNormalizationWarning,
  };
}
