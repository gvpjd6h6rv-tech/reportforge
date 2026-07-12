'use strict';
import { writeTextFileAtomically } from '../io/write_text_file_atomically.mjs';
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; const out = {}; for (const key of Object.keys(value).sort()) out[key] = stable(value[key]); return out; }
export async function reportJson(report, outputPath = null) { const text = `${JSON.stringify(stable(report), null, 2)}\n`; if (outputPath) writeTextFileAtomically(outputPath, text); return text; }
