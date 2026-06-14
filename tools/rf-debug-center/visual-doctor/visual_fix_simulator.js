const UNSAFE_CSS = /@import|url\s*\(\s*['"]?\s*(data:|blob:|javascript:)|expression\s*\(|<\/?(?:script|style|html|body)|base64|blob:/i;

function measureElement(element) {
  const rect = element?.getBoundingClientRect?.();
  return { height: Math.round(Number(rect?.height || 0)), width: Math.round(Number(rect?.width || 0)) };
}

function shouldBuildPlan(recipe = {}) {
  return Boolean(recipe && recipe.title !== 'No repair needed' && recipe.severity !== 'NONE');
}

function buildCssText(selector = '', expectedHeight = 0) {
  if (!selector || !expectedHeight) return '';
  return `${selector} { height: ${expectedHeight}px; line-height: ${expectedHeight}px; }`;
}

export function buildSafeCssSimulationPlan(diagnosis = {}, repairRecipe = {}, options = {}) {
  if (!shouldBuildPlan(repairRecipe)) return null;
  const selector = options.selector || diagnosis.selector || diagnosis.diagnosticTarget?.selector || repairRecipe.targetSelectors?.[0] || '';
  const expectedHeight = Math.round(Number(options.expectedHeight || diagnosis.reference?.height || diagnosis.currentHeight || 0));
  return { selector, cssText: options.cssText || buildCssText(selector, expectedHeight), expectedHeight, source: options.source || 'repairRecipe', safety: { runtimeOnly: true, writesFiles: false, rollbackRequired: true, autopatch: false } };
}

function makeFailure(reason, before = null) {
  return { applied: false, rolledBack: true, before, after: null, improved: false, confidence: 'low', recommendation: reason };
}

function buildSuccess(before, after, expectedHeight) {
  const improved = Math.abs(after.height - Number(expectedHeight || 0)) < Math.abs(before.height - Number(expectedHeight || 0));
  return { applied: true, rolledBack: true, before, after, improved, confidence: improved ? 'high' : 'medium', recommendation: improved ? 'Recipe validated in runtime simulation; human review still required.' : 'Simulation did not validate the plan.' };
}

export function simulateCssFixInDom(plan = {}, windowLike = null, options = {}) {
  if (!plan || UNSAFE_CSS.test(String(plan.cssText || ''))) return makeFailure('Simulation CSS rejected as unsafe.');
  const documentLike = windowLike?.document || (typeof document !== 'undefined' ? document : null);
  const element = documentLike?.querySelector?.(plan.selector);
  if (!documentLike || !element) return makeFailure('Simulation selector not found.');
  const before = measureElement(element);
  const style = documentLike.createElement('style');
  style.setAttribute('data-visual-doctor-simulation', plan.selector || 'unknown');
  style.textContent = plan.cssText || '';
  try {
    documentLike.head.appendChild(style);
    options.afterApply?.(element, style);
    return buildSuccess(before, measureElement(element), plan.expectedHeight);
  } catch (error) {
    return { ...makeFailure(`Simulation failed: ${error?.message || 'unknown error'}`, before), error: String(error?.message || error || '') };
  } finally {
    style.remove?.();
  }
}

export function summarizeSimulationResult(result = {}) {
  if (!result?.applied) return result?.recommendation || 'No simulation run';
  return `${result.improved ? 'improved' : 'not improved'} from ${result.before?.height || 0}px to ${result.after?.height || 0}px; rollback ${result.rolledBack ? 'ok' : 'missing'}`;
}
