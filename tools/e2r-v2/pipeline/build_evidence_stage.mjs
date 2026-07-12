'use strict';
import { collectSpScores } from '../collectors/collect_sp_scores.mjs';
import { collectFileTestEvidence } from '../collectors/collect_file_test_evidence.mjs';
import { collectFingerprint } from '../collectors/collect_fingerprint.mjs';
import { collectModuleEdges } from '../collectors/collect_module_edges.mjs';
export async function buildEvidenceStage({ root, physical, scoreResult, testEvidenceRecords }) { const moduleEdges = collectModuleEdges(physical); const spScores = collectSpScores(scoreResult, root); const fileTestEvidence = collectFileTestEvidence(testEvidenceRecords || []); const fingerprint = collectFingerprint({ physical, spScores, fileTestEvidence, moduleEdges }); return { moduleEdges, spScores, fileTestEvidence, fingerprint }; }
