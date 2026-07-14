'use strict';
export function checkEvidenceCompleteness({ capabilityMap = {} } = {}) {
  const files = capabilityMap?.capabilities?.[0]?.files || [];
  const normalize = (value) => String(value || '').replace(/\\/g, '/');
  const violations = files.flatMap((file) => {
    const evidence = Array.isArray(file?.evidence) ? file.evidence : [];
    const reviewed = file?.reviewedCandidateEvidence;
    return [
      ...(evidence.length && evidence.every((entry) => entry && typeof entry.type === 'string' && typeof entry.symbol === 'string' && typeof entry.lines === 'string') ? [] : [{ code: 'EVIDENCE_MISSING_OR_INVALID', path: normalize(file?.path) }]),
      ...(!reviewed || typeof reviewed.evidenceVersion !== 'string' || !reviewed.evidenceVersion || typeof reviewed.reviewDecision !== 'string' || !reviewed.reviewDecision || !Array.isArray(reviewed.supportingEdgeIds) ? [{ code: 'REVIEWED_CANDIDATE_EVIDENCE_INVALID', path: normalize(file?.path), reviewed: reviewed || null }] : []),
    ];
  });
  return { name: 'check_evidence_completeness', value: violations.length === 0, evidence: { violations, total: files.length }, diagnostics: violations };
}
