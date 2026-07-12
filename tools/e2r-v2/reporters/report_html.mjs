'use strict';
import { writeTextFileAtomically } from '../io/write_text_file_atomically.mjs';
import { buildReportViewModel } from './build_report_view_model.mjs';
import { renderHtmlClientScript } from './render_html_client_script.mjs';
import { renderHtmlDocument } from './render_html_document.mjs';
export async function reportHtml(report, outputPath = null) { const viewModel = buildReportViewModel(report); viewModel.clientScript = renderHtmlClientScript(); const html = renderHtmlDocument(viewModel); if (outputPath) writeTextFileAtomically(outputPath, html); return html; }
