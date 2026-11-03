/* eslint-disable @typescript-eslint/no-require-imports */
/** Isolated tabs dialog/ruler/style-draft UI regression; no user documents. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 const base = process.env.BASE_URL || 'http://localhost:3107', mod = process.platform === 'darwin' ? 'Meta' : 'Control';
 try {
  const context = await browser.newContext({ viewport: { width: 1450, height: 1050 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.goto(base + '/pad'); const editor = page.locator('.ProseMirror'); await editor.waitFor(); await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({ state: 'hidden' }); await editor.fill('Alpha'); await editor.press('End'); await editor.press('Enter'); await editor.pressSequentially('Beta');
  const paragraphs = editor.locator('p');
  const tabs = async index => JSON.parse(await paragraphs.nth(index).getAttribute('data-edtr-paragraph') || '{}').tabs || [];
  async function openTabs() { await page.getByRole('menuitem', { name: 'Format', exact: true }).click(); await page.getByRole('menuitem', { name: 'Tab stops…', exact: true }).click(); return page.getByRole('dialog', { name: 'Tab stops', exact: true }); }
  async function setStop(dialog, position, alignment = 'left', leader = 'none') {
   await dialog.getByRole('spinbutton', { name: 'Position (cm)', exact: true }).fill(position);
   await dialog.getByRole('combobox', { name: 'Alignment', exact: true }).selectOption(alignment);
   await dialog.getByRole('combobox', { name: 'Leader', exact: true }).selectOption(leader);
   await dialog.getByRole('button', { name: 'Set tab stop', exact: true }).click();
  }
  async function apply(dialog) { await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); }
  let dialog = await openTabs(); await setStop(dialog, '2.54', 'right', 'dot'); await apply(dialog);
  assert.deepEqual(await tabs(1), [{ position: 1440, alignment: 'right', leader: 'dot' }]); assert.deepEqual(await tabs(0), []);
  // Mixed selection never presents its first paragraph as a shared value.
  await editor.focus(); await page.keyboard.press(mod + '+a'); dialog = await openTabs();
  assert.equal(await dialog.getByText('The selected paragraphs have different tab stops. Changes apply to every selected paragraph.', { exact: true }).count(), 1);
  await setStop(dialog, '1.27', 'decimal', 'dash');
  await dialog.getByRole('spinbutton', { name: 'Default interval (cm)', exact: true }).fill('1.00');
  await dialog.getByRole('combobox', { name: 'Decimal separator', exact: true }).selectOption('٫'); await apply(dialog);
  for (const index of [0, 1]) assert.ok((await tabs(index)).some(stop => stop.position === 720 && stop.alignment === 'decimal' && stop.leader === 'dash'));
  assert.ok((await tabs(1)).some(stop => stop.position === 1440));
  dialog = await openTabs(); assert.equal(await dialog.getByRole('spinbutton', { name: 'Default interval (cm)', exact: true }).inputValue(), '1.00'); assert.equal(await dialog.getByRole('combobox', { name: 'Decimal separator', exact: true }).inputValue(), '٫'); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  // A single ruler gesture is one undoable change; Escape leaves history alone.
  await paragraphs.nth(1).click(); await page.getByRole('menuitem', { name: 'View', exact: true }).click(); await page.getByRole('menuitemcheckbox', { name: 'Ruler', exact: true }).click();
  let marker = page.getByRole('button', { name: 'Right 2.54 cm', exact: true }); await marker.waitFor(); await page.waitForTimeout(200);
  const scale = await editor.evaluate(el => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).width)), before = await tabs(1), box = await marker.boundingBox();
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, moved = 1440 + Math.round(30 / (scale / 15));
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 30, start.y, { steps: 5 }); await page.mouse.up();
  assert.ok((await tabs(1)).some(stop => stop.position === moved && stop.alignment === 'right'));
  await page.keyboard.press(mod + '+z'); assert.deepEqual(await tabs(1), before);
  marker = page.getByRole('button', { name: 'Right 2.54 cm', exact: true }); await marker.waitFor();
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 45, start.y, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up(); assert.deepEqual(await tabs(1), before);
  await marker.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100); assert.ok((await tabs(1)).some(stop => stop.position === 1460 && stop.alignment === 'right')); assert.equal(await page.locator('[data-tab-position="1460"]').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Delete'); assert.ok((await tabs(1)).some(stop => stop.position === 1460 && stop.alignment === 'clear'));
  const track = page.locator('[data-tab-ruler-track]'), trackBox = await track.boundingBox();
  await page.getByRole('combobox', { name: 'New tab alignment', exact: true }).selectOption('center');
  await page.mouse.click(start.x + 80, trackBox.y + trackBox.height - 5); assert.ok((await tabs(1)).some(stop => stop.alignment === 'center'));
  // Style tabs edit the local draft. Neither child Apply nor parent Cancel saves it.
  async function openStyles() { await page.getByRole('menuitem', { name: 'Format', exact: true }).click(); await page.getByRole('menuitem', { name: 'Manage styles…', exact: true }).click(); return page.getByRole('dialog', { name: 'Manage styles', exact: true }); }
  let styles = await openStyles(); await styles.getByRole('button', { name: 'New style', exact: true }).click(); await styles.getByRole('textbox', { name: 'Style name', exact: true }).fill('Tabs draft');
  await styles.getByRole('button', { name: 'Edit style tab stops', exact: true }).click(); dialog = page.getByRole('dialog', { name: 'Tab stops', exact: true }); await setStop(dialog, '3.81', 'center'); await apply(dialog);
  assert.equal(await styles.getByRole('textbox', { name: 'Style name', exact: true }).inputValue(), 'Tabs draft'); await styles.getByRole('button', { name: 'Cancel', exact: true }).click();
  styles = await openStyles(); assert.equal(await styles.getByRole('option', { name: 'Tabs draft', exact: true }).count(), 0);
  await styles.getByRole('button', { name: 'New style', exact: true }).click(); await styles.getByRole('textbox', { name: 'Style name', exact: true }).fill('Tabs saved');
  await styles.getByRole('button', { name: 'Edit style tab stops', exact: true }).click(); dialog = page.getByRole('dialog', { name: 'Tab stops', exact: true }); await setStop(dialog, '3.81', 'center'); await apply(dialog); await styles.getByRole('button', { name: 'Create and apply', exact: true }).click();
  // Remove suppresses inherited positions; reset reveals them again.
  dialog = await openTabs(); const inherited = dialog.getByRole('button').filter({ hasText: '3.81 cm' }); assert.ok((await inherited.textContent()).includes('Inherited')); await inherited.click(); await dialog.getByRole('button', { name: 'Remove stop', exact: true }).click(); await apply(dialog); assert.ok((await tabs(1)).some(stop => stop.position === 2160 && stop.alignment === 'clear'));
  dialog = await openTabs(); await dialog.getByRole('button', { name: 'Reset tab edits', exact: true }).click(); await apply(dialog); assert.deepEqual(await tabs(1), []);
  dialog = await openTabs(); assert.ok((await dialog.getByRole('button').filter({ hasText: '3.81 cm' }).textContent()).includes('Inherited')); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  // A derived style must inherit identical tab arrays rather than freezing a copy.
  styles = await openStyles(); await styles.getByRole('button', { name: 'New style', exact: true }).click(); await styles.getByRole('textbox', { name: 'Style name', exact: true }).fill('Tabs child'); await styles.getByRole('button', { name: 'Create and apply', exact: true }).click();
  styles = await openStyles(); await styles.getByRole('button', { name: 'Edit style tab stops', exact: true }).click(); dialog = page.getByRole('dialog', { name: 'Tab stops', exact: true });
  assert.ok((await dialog.getByRole('button').filter({ hasText: '3.81 cm' }).textContent()).includes('Inherited')); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await styles.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(errors, []); await context.close();
  // Dark, narrow and RTL dialog layout remains inside the viewport.
  for (const locale of ['en', 'ar']) {
   const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mobile.addCookies([{ name: 'wordpad-locale', value: locale, url: base }]); const p = await mobile.newPage();
   await p.goto(base + '/pad'); await p.locator('.ProseMirror').waitFor(); await p.locator('.editor-shell > div[aria-hidden="true"]').waitFor({ state: 'hidden' }); await p.evaluate(() => document.documentElement.classList.add('dark'));
   await p.getByRole('menuitem', { name: locale === 'ar' ? 'تنسيق' : 'Format', exact: true }).click(); await p.getByRole('menuitem', { name: locale === 'ar' ? 'علامات الجدولة…' : 'Tab stops…', exact: true }).click();
   const d = p.getByRole('dialog'), m = await d.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, height: el.getBoundingClientRect().height, scroll: el.scrollWidth, width: el.clientWidth, direction: getComputedStyle(el).direction }));
   assert.ok(m.left >= 0 && m.right <= 390 && m.height <= 844 * .91 && m.scroll <= m.width + 1, JSON.stringify(m)); assert.equal(m.direction, locale === 'ar' ? 'rtl' : 'ltr'); await mobile.close();
  }
  console.log('PASS tabs dialog exact positions/settings/mixed selection, ruler add/move/delete/Escape/undo/keyboard focus, style draft cancel/save, inherited clear/reset, dark mobile/RTL');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
