/* eslint-disable @typescript-eslint/no-require-imports */
/** Imported paragraph padding and borders must participate in column flow. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1050 } });
    await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
    await page.locator('.ProseMirror').waitFor();
    await page.waitForTimeout(1000);
    await page.locator('.ProseMirror').fill('Import pending');
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(path.resolve('fixtures/compatibility/columns.docx'));
    await page.getByRole('button', { name: 'Replace document', exact: true }).click();
    await page.locator('[data-column-paragraph-borders] > div').waitFor();
    const actual = await page.evaluate(() => {
      const root = document.querySelector('.ProseMirror');
      const title = [...root.querySelectorAll('p')].find(p => p.textContent.includes('Two column fixture'));
      const next = [...root.querySelectorAll('p')].find(p => p.textContent.includes('COLUMN_00'));
      const border = document.querySelector('[data-column-paragraph-borders] > div');
      const b = border.getBoundingClientRect(), n = next.getBoundingClientRect();
      return { borderWidth: b.width, rootWidth: root.getBoundingClientRect().width, borderBottom: b.bottom, nextTop: n.top, originalColor: getComputedStyle(title).borderBottomColor };
    });
    assert(actual.borderWidth > 200 && actual.borderWidth < actual.rootWidth / 2, 'border must be limited to the column');
    assert(actual.nextTop >= actual.borderBottom - 0.1, 'the next paragraph must follow the border and its padding');
    assert.equal(actual.originalColor, 'rgba(0, 0, 0, 0)', 'expanded source box must not paint a full-page border');
    console.log('PASS paragraph border stays in its column and its padding contributes to flow');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
