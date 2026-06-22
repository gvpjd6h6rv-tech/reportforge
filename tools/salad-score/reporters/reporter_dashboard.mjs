'use strict';
import { templateDashboard } from '../dashboard/template_dashboard.mjs';

/** Static dashboard report — delegates entirely to template_dashboard.mjs. No computation, no I/O. */
export function reporterDashboard(results, repoScore, config) {
  return templateDashboard({ results, repoScore, config, generatedAt: new Date().toISOString() });
}
