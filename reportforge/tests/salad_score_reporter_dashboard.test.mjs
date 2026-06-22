'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reporterDashboard } from '../../tools/salad-score/reporters/reporter_dashboard.mjs';
import { isValidReport } from '../../tools/salad-score/contracts/contract_reporter.mjs';

const RESULTS = [{
  path: 'a.js', owner: 'unowned', file_type: 'engine', loc: 10,
  responsibilities_detected: [], sp_file_score: 0, sp_behavior_score: 0, sp_total_score: 0,
  level: 'limpio', reasons: [], suggested_split: [], violated_rules: [], evidence: [],
}];
const CONFIG = { dashboardTop: 20, weights: {}, caps: {}, levelScale: [] };

test('reporterDashboard — delegates to template_dashboard and satisfies contract_reporter', () => {
  const html = reporterDashboard(RESULTS, 12.3, CONFIG);
  assert.equal(isValidReport(html), true);
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /12\.3/);
});
