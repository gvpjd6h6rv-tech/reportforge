import test from 'node:test';
import assert from 'node:assert/strict';

import { renderHtmlClientScript } from '../../../tools/e2r-v2/reporters/render_html_client_script.mjs';

test('client script is emitted', () => {
  assert.match(renderHtmlClientScript(), /filterRows/);
});
