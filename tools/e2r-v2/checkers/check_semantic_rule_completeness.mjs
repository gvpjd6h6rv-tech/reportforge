'use strict';
function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function result(name, value, evidence, diagnostics = []) {
  return { name, value: Boolean(value), evidence, diagnostics };
}

export function checkSemanticRuleCompleteness({ capabilityMap = {} } = {}) {
  const files = capabilityMap?.capabilities?.[0]?.files || [];
  const prefixByClassification = {
    GEOMETRY_MEMBER: 'GM-',
    GEOMETRY_DEPENDENT: 'GD-',
    GEOMETRY_EXCLUDED: 'GX-',
  };
  const violations = [];
  for (const file of files) {
    const expectedPrefix = prefixByClassification[file?.classification];
    const actual = String(file?.semanticContractRule || '');
    if (!expectedPrefix || !actual.startsWith(expectedPrefix)) {
      violations.push({
        code: 'SEMANTIC_RULE_PREFIX_MISMATCH',
        path: normalizePath(file?.path),
        classification: file?.classification || null,
        semanticContractRule: actual,
        expectedPrefix: expectedPrefix || null,
      });
    }
  }
  return result('check_semantic_rule_completeness', violations.length === 0, { violations, total: files.length }, violations);
}
