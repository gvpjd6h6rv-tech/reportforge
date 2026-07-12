'use strict';
import { main } from '../../../tools/salad-score/subsystem-gate/bin/salad-score-subsystem.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { captureCliOutput } from './_capture_cli_output.mjs';

/** Test-only harness: materializes the given fixture, builds the standard
 *  CLI argv from {root, config, ownershipMapPath, scopeMapPath, subsystemId}
 *  (each overridable per-call for error-path tests), invokes main() with
 *  real stdout/stderr capture, and returns {result, stdout, stderr}. No
 *  assertions -- pure invocation plumbing, shared across CLI test files. */
export async function runCliInFixture(fixtureDescriptor, argsFn) {
  return withMaterializedFixture(fixtureDescriptor, async (root) => {
    const a = argsFn(root);
    process.exitCode = undefined;
    const argv = ['--root', a.root ?? root, '--config', a.config, '--ownership-map', a.ownershipMap ?? root + '/audit/subsystem_ownership_map.json', '--scope-map', a.scopeMap ?? root + '/audit/subsystem_scope_map.json', '--subsystem-id', a.subsystemId];
    const out = captureCliOutput(() => main(argv));
    const exitCode = process.exitCode;
    process.exitCode = undefined;
    return { ...out, exitCode };
  });
}
