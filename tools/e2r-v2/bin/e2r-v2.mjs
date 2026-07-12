'use strict';
import fs from 'node:fs';
import { parseCliArguments } from '../cli/parse_cli_arguments.mjs';
import { runE2RV2 } from '../runner/run_e2r_v2.mjs';
export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCliArguments(argv);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    process.exitCode = 2;
    return { ok: false, error: parsed.error, exitCode: 2 };
  }
  if (parsed.value.help) {
    process.stdout.write('usage: e2r-v2 [--root PATH] [--config PATH] [--capability-map PATH] [--ownership-map PATH] [--write-json PATH] [--write-html PATH] [--strict]\n');
    process.exitCode = 0;
    return { ok: true, help: true, exitCode: 0 };
  }
  try {
    const config = JSON.parse(fs.readFileSync(parsed.value.config, 'utf8'));
    const result = await runE2RV2({
      root: parsed.value.root,
      config,
      capabilityMapPath: parsed.value.capabilityMap,
      ownershipMapPath: parsed.value.ownershipMap,
      writeJson: parsed.value.writeJson,
      writeHtml: parsed.value.writeHtml,
      strict: parsed.value.strict,
    });
    process.stdout.write(`${JSON.stringify(result.report.viewModel, null, 2)}\n`);
    process.exitCode = result.exitCode;
    return result;
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
    return { ok: false, error, exitCode: 1 };
  }
}
if (process.argv[1] && process.argv[1].endsWith('e2r-v2.mjs')) main();
