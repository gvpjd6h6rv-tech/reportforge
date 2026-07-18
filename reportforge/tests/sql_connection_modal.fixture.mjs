import { loadSQLModalRuntime } from './sql_connection_modal_runtime.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES = [
  'engines/SQLConnectionDiagnosis.js',
  'engines/SQLConnectionModalFields.js',
  'engines/SQLConnectionModalView.js',
  'engines/SQLConnectionModalApi.js',
  'engines/SQLConnectionModalStorage.js',
  'engines/SQLConnectionModal.js',
].map((path) => fs.readFileSync(`${ROOT}/${path}`, 'utf8'));

export function loadSQLModal({ fetchImpl = null } = {}) {
  return loadSQLModalRuntime({ sources: SOURCES, fetchImpl });
}
