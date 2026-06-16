'use strict';

async function enterPreview(page) {
  await page.evaluate(() => {
    const tab = document.getElementById('tab-preview');
    if (tab) {
      tab.click();
      return;
    }
    window.PreviewEngineV19?.show?.();
  });
}

async function returnDesign(page) {
  await page.evaluate(() => {
    const tab = document.getElementById('tab-design');
    if (tab) {
      tab.click();
      return;
    }
    window.PreviewEngineV19?.hide?.();
  });
}

module.exports = {
  enterPreview,
  returnDesign,
};
