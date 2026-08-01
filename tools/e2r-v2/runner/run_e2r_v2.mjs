
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { runSaladScore } from '../../salad-score/runner/run_salad_score.mjs';
import { buildInventoryStage } from '../pipeline/build_inventory_stage.mjs';
import { buildTestEvidenceStage } from '../pipeline/build_test_evidence_stage.mjs';
import { buildScoringStage } from '../pipeline/build_scoring_stage.mjs';
import { buildValidationStage } from '../pipeline/build_validation_stage.mjs';
import { buildReportPayload } from '../pipeline/build_report_payload.mjs';
import { buildReportViewModel } from '../reporters/build_report_view_model.mjs';
import { reportJson } from '../reporters/report_json.mjs';
import { reportHtml } from '../reporters/report_html.mjs';

export async function runE2RV2({ root, config, capabilityMapPath, ownershipMapPath, writeJson = null, writeHtml = null, strict = false }) {
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const scoreResult = runSaladScore({ roots: [path.resolve(root, ...config.scanRoots)], config, ownershipMapPath });
  const inventory = buildInventoryStage({ root, config, capabilityMap, ownershipMapPath });
  const evidence = await buildTestEvidenceStage({ root, physical: inventory.physical, scoreResult, capabilityMap });
  const scoring = buildScoringStage({ capabilityMap, ownership: inventory.ownership, evidence });
  const report = buildReportPayload({ root, capabilityMap, capabilityMapPath, ownershipMapPath, inventory, scoring });
  const validation = buildValidationStage({ report, inventory, evidence });
  report.validation = validation;
  report.viewModel = buildReportViewModel(report);
  const result = { report, validation, evidence, exitCode: strict && validation.strictFailures ? 1 : 0 };
  if (writeJson) await reportJson(report, writeJson);
  if (writeHtml) await reportHtml(report, writeHtml);
  return result;
}
