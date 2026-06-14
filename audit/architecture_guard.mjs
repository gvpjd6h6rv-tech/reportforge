import { runOwnershipGuard } from './architecture/run_ownership_guard.mjs';

const result = runOwnershipGuard();

if (!result.ok) {
  console.error('ARCHITECTURE_GUARD_FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('ARCHITECTURE_GUARD_OK');
for (const rule of result.map.rules || []) {
  console.log(`owner=${rule.owner} path=${rule.path}`);
}
