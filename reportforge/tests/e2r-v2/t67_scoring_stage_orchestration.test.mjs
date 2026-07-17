import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('t67 scoring stage derives expected members from the active capability map', () => {
  const source = fs.readFileSync(
    'tools/e2r-v2/pipeline/build_scoring_stage.mjs',
    'utf8',
  );

  assert.match(source, /const expectedMemberCount = memberFiles\.length/);
  assert.match(
    source,
    /calculateCapabilityAggregate\(memberScores, expectedMemberCount\)/,
  );
  assert.match(
    source,
    /memberScores\.length < expectedMemberCount/,
  );
  assert.doesNotMatch(source, /memberScores\.length < 56/);
});
