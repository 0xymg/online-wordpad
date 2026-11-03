/* eslint-disable @typescript-eslint/no-require-imports */
/** Exercise the fragment editor's production dispatch/history path through UI. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 try {
  const page = await browser.newPage({ viewport: { width: 1450, height: 1050 } }), errors = [], mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad'); await page.locator('.editor-shell .ProseMirror').fill('HEADER HISTORY BODY');
  await page.getByRole('menuitem', { name: 'Insert', exact: true }).click(); await page.getByRole('menuitem', { name: 'Header & footer…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Header & footer', exact: true }), header = dialog.getByRole('textbox', { name: 'Header', exact: true }); await header.fill('A'); await page.keyboard.press('End');
  await dialog.getByRole('button', { name: 'Tab stops', exact: true }).first().click(); const tabs = page.getByRole('dialog', { name: 'Tab stops', exact: true });
  await tabs.getByLabel('Position (cm)').fill('1.27'); await tabs.getByRole('button', { name: 'Set tab stop', exact: true }).click(); await tabs.getByRole('button', { name: 'Apply', exact: true }).click();
  const stops = async () => JSON.parse(await header.locator('p').first().getAttribute('data-edtr-paragraph') || '{}').tabs || [];
  assert.deepEqual(await stops(), [{ position: 720, alignment: 'left', leader: 'none' }]);
  // No artificial history delay: this reproduces immediate typing after Apply.
  await tabs.waitFor({ state: 'hidden' }); await header.focus(); await page.keyboard.press('End');
  await page.keyboard.type('B'); assert.equal(await header.textContent(), 'AB');
  await page.keyboard.press(mod + '+z'); assert.equal(await header.textContent(), 'A'); assert.equal((await stops())[0]?.position, 720, 'Undo typing preserves the preceding tab-format edit');
  await page.keyboard.press(mod + '+z'); assert.equal(await header.textContent(), 'A'); assert.deepEqual(await stops(), [], 'A second Undo restores the original tab formatting');
  await page.keyboard.press(mod + '+Shift+z'); assert.equal((await stops())[0]?.position, 720); assert.equal(await header.textContent(), 'A');
  await page.keyboard.press(mod + '+Shift+z'); assert.equal(await header.textContent(), 'AB');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(await page.locator('.pm-running-header').count(), 0, 'Cancel still discards the complete header draft'); assert.deepEqual(errors, []);
  console.log('PASS header tab formatting and immediate typing have separate undo/redo steps; parent Cancel preserves the real document');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
