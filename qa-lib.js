/**
 * qa-lib.js — shared helpers for ReportForge QA scripts
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

async function launch(headless = true) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page    = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors  = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(2000);
  return { browser, page, errors };
}

function rect(r) { return `x=${r?.x} y=${r?.y} w=${r?.w} h=${r?.h}`; }

module.exports = { launch, rect };
