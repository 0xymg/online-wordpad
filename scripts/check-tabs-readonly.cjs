/* eslint-disable @typescript-eslint/no-require-imports */
/** Future-model source remains protected even when tab controls are invoked. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 try {
  const page = await browser.newPage({ viewport: { width: 1450, height: 1050 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  const original = '<div data-edtr-model="{&quot;version&quot;:999}"><p>FUTURE MODEL KEEP ORIGINAL</p></div>';
  await page.addInitScript(html => { localStorage.setItem('wordpad-files', JSON.stringify([{ id: 'readonly-tabs', name: 'Future source', html }])); localStorage.setItem('wordpad-active', 'readonly-tabs'); }, original);
  await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad'); const editor = page.locator('.editor-shell .ProseMirror'); await editor.waitFor();
  await page.waitForFunction(() => document.querySelector('.editor-shell .ProseMirror')?.getAttribute('contenteditable') === 'false'); const before = await editor.innerHTML();
  await page.getByRole('menuitem', { name: 'View', exact: true }).click(); await page.getByRole('menuitemcheckbox', { name: 'Ruler', exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: 'New tab alignment', exact: true }).isDisabled(), true); assert.equal(await page.getByRole('button', { name: 'Open tab stops', exact: true }).isDisabled(), true);
  const track = page.locator('[data-tab-ruler-track]'), box = await track.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); assert.equal(await editor.innerHTML(), before);
  await page.getByRole('menuitem', { name: 'Format', exact: true }).click(); await page.getByRole('menuitem', { name: 'Tab stops…', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Tab stops', exact: true });
  assert.equal(await dialog.getByLabel('Position (cm)').isDisabled(), true); assert.equal(await dialog.getByRole('button', { name: 'Apply', exact: true }).isDisabled(), true); assert.equal(await dialog.getByText('This document is read-only.', { exact: true }).count(), 1);
  // A synthetic submit also reaches the guard without writing to the view.
  await dialog.locator('form').dispatchEvent('submit'); assert.equal(await editor.innerHTML(), before); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const files = await page.evaluate(() => JSON.parse(localStorage.getItem('wordpad-files'))); assert.equal(files.find(file => file.id === 'readonly-tabs').html, original); assert.deepEqual(errors, []);
  console.log('PASS blocked-source ruler/dialog controls are disabled, synthetic Apply cannot mutate view, original future-model HTML stays unchanged');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
