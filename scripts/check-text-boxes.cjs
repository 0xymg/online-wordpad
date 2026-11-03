/* eslint-disable @typescript-eslint/no-require-imports */
/** Real editor regression for plain native text boxes. Uses isolated temporary documents. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-text-boxes-'));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1050 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
    await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
    await page.locator('.ProseMirror').waitFor(); await page.waitForTimeout(1100);
    const box = page.locator('.ProseMirror .pm-textbox-wrapper').first();
    const frame = box.locator('.pm-textbox-frame');
    const attrs = () => box.evaluate(el => JSON.parse(el.dataset.edtrTextbox));
    const settle = () => page.waitForTimeout(250);
    await page.locator('.ProseMirror').fill('INSERT FIXTURE');
    await page.keyboard.press('End');
    await page.getByRole('menuitem', { name: 'Insert', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Text box', exact: true }).click();
    const insertedDialog = page.getByRole('dialog', { name: 'Edit text box', exact: true });
    await insertedDialog.getByRole('textbox', { name: 'Text', exact: true }).fill('INSERTED BOX');
    await insertedDialog.getByRole('button', { name: 'Apply', exact: true }).click(); await settle();
    assert.equal(await frame.textContent(), 'INSERTED BOX');
    await frame.click(); await page.keyboard.press('Delete'); await settle();
    assert.equal(await page.locator('.ProseMirror .pm-textbox-wrapper').count(), 0, 'Delete removes selected text box');
    await page.keyboard.press('Meta+z'); await settle(); await frame.click(); await page.keyboard.press('Backspace'); await settle();
    assert.equal(await page.locator('.ProseMirror .pm-textbox-wrapper').count(), 0, 'Backspace removes selected text box');
    await page.keyboard.press('Meta+z'); await settle(); assert.equal(await frame.textContent(), 'INSERTED BOX');
    async function loadHtml(html) {
      const file = path.join(dir, 'fixture.html'); await fs.writeFile(file, html);
      await page.locator('.ProseMirror').fill('Import pending');
      await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
      await page.getByRole('button', { name: 'Replace document', exact: true }).click();
      await frame.waitFor(); await settle();
    }
    const initial = { text: 'BOX FIRST\n\nSecond <line> & text\nTab\there\n', position: 'page', x: 130, y: 220, width: '250px', height: 132, layer: 1, textPlane: 'front', fontSize: 14, fontFamily: 'Calibri, Carlito, Arial, sans-serif', color: '#123456', background: '#ffffff', borderColor: '#666666', padding: 8 };
    const json = JSON.stringify(initial).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    await loadHtml(`<p>FIXTURE TEXT BOX</p><p>Anchor <span data-edtr-textbox="${json}"></span> text after.</p>`);
    assert.equal((await attrs()).text, initial.text); assert.equal(await frame.textContent(), initial.text);
    const metrics = await frame.evaluate(el => ({ fontSize: getComputedStyle(el).fontSize, whiteSpace: getComputedStyle(el).whiteSpace, height: el.offsetHeight }));
    assert.ok(Math.abs(parseFloat(metrics.fontSize) - 14 * 96 / 72) < .1); assert.equal(metrics.whiteSpace, 'pre-wrap');
    await frame.click(); await settle();
    let before = await attrs(), r = await frame.boundingBox();
    await page.mouse.move(r.x + 25, r.y + 60); await page.mouse.down(); await page.mouse.move(r.x + 65, r.y + 95, { steps: 6 }); await page.mouse.up();
    assert.deepEqual(await attrs(), before, 'body text must never start box movement');
    async function moveHandle(dx, dy, cancel) {
      const handle = box.getByRole('button', { name: 'Move text box', exact: true });
      const h = await handle.boundingBox(); await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2 + dx, h.y + h.height / 2 + dy, { steps: 6 });
      if (cancel) await page.keyboard.press('Escape'); await page.mouse.up(); await settle();
    }
    await moveHandle(40, 35, true); assert.deepEqual(await attrs(), before, 'Escape discards box move');
    await moveHandle(40, 35, false); let moved = await attrs(); assert.ok(Math.abs(moved.x - before.x - 40) < 1); assert.ok(Math.abs(moved.y - before.y - 35) < 1);
    await page.keyboard.press('Meta+z'); await settle(); assert.deepEqual(await attrs(), before, 'one undo reverts all movement');
    await page.keyboard.press('Meta+Shift+z'); await settle(); assert.deepEqual(await attrs(), moved);
    const resize = box.locator('.pm-textbox-handle-br'); r = await resize.boundingBox();
    await page.mouse.move(r.x + 5, r.y + 5); await page.mouse.down(); await page.mouse.move(r.x + 75, r.y + 45, { steps: 6 }); await page.mouse.up(); await settle();
    const resized = await attrs(); assert.ok(parseFloat(resized.width) > parseFloat(moved.width) + 50); assert.ok(resized.height > moved.height + 20);
    await page.keyboard.press('Meta+z'); await settle(); assert.deepEqual(await attrs(), moved, 'resize is one undo step');
    const openDialog = async () => { await frame.click(); await box.getByRole('button', { name: 'Edit text box', exact: true }).click(); return page.getByRole('dialog', { name: 'Edit text box', exact: true }); };
    let d = await openDialog(); await d.getByRole('textbox', { name: 'Text', exact: true }).fill('cancelled'); await d.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal((await attrs()).text, initial.text);
    const updatedText = 'NATIVE EDITABLE BOX\n\nPlain multiline & <safe> text\nFinal\tcolumn\n';
    d = await openDialog(); await d.getByRole('textbox', { name: 'Text', exact: true }).fill(updatedText); await d.getByRole('button', { name: 'Apply', exact: true }).click(); await settle();
    assert.equal(await frame.textContent(), updatedText);
    await page.keyboard.press('Meta+z'); await settle(); assert.equal((await attrs()).text, initial.text); await page.keyboard.press('Meta+Shift+z'); await settle();
    await page.waitForTimeout(1100); await page.reload(); await frame.waitFor(); assert.equal((await attrs()).text, updatedText); assert.ok(Math.abs((await attrs()).x - moved.x) < .1);
    // Native editable Word content, including blank/trailing lines, and a real re-import.
    async function output(format, name) {
      await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export', exact: true }).hover();
      const event = page.waitForEvent('download', { timeout: 60000 }); await page.getByRole('menuitem', { name: format, exact: true }).click();
      const file = path.join(dir, name); await (await event).saveAs(file); return file;
    }
    const word = await output('Word (.docx)', 'text-box.docx');
    const zip = await JSZip.loadAsync(await fs.readFile(word)), xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /<v:shape\b/); assert.match(xml, /<v:textbox\b/); assert.match(xml, /<w:txbxContent>/); assert.match(xml, /mso-fit-shape-to-text:t/); assert.match(xml, /NATIVE EDITABLE BOX/); assert.doesNotMatch(xml, /EDTRTextBoxExport/);
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(word); await page.getByRole('button', { name: 'Replace document', exact: true }).click(); await settle();
    assert.equal(await page.locator('.ProseMirror .pm-textbox-wrapper').count(), 1); const roundtrip = await attrs(); assert.equal(roundtrip.text, updatedText); assert.equal(roundtrip.fontSize, 14); assert.equal(roundtrip.color, initial.color); assert.equal(roundtrip.fontFamily, initial.fontFamily);
    assert.ok(Math.abs(roundtrip.x - moved.x) < .01 && Math.abs(roundtrip.y - moved.y) < .01); assert.equal(roundtrip.width, moved.width);
    // Foreign rich content is flattened to plain text without dropping table text.
    const foreign = await JSZip.loadAsync(await fs.readFile(word));
    const foreignXml = xml.replace(/ alt="[^"]*"/, '').replace('</w:txbxContent>', '<w:tbl><w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>BOX TABLE TEXT</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:txbxContent>');
    foreign.file('word/document.xml', foreignXml); const foreignFile = path.join(dir, 'foreign-text-box.docx'); await fs.writeFile(foreignFile, await foreign.generateAsync({ type: 'nodebuffer' }));
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(foreignFile); await page.getByRole('button', { name: 'Replace document', exact: true }).click(); await settle();
    assert.ok((await attrs()).text.includes(updatedText.trimEnd())); assert.ok((await attrs()).text.includes('BOX TABLE TEXT'));
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(word); await page.getByRole('button', { name: 'Replace document', exact: true }).click(); await settle();
    // PDF uses the live artwork and strips all controls, without changing font metrics.
    await page.evaluate(() => { window.__textBoxPrint = null; const o = new MutationObserver(() => { const frame = document.querySelector('.edtr-print-sheet .pm-textbox-frame'); if (!frame) return; window.__textBoxPrint = { text: frame.textContent, fontSize: getComputedStyle(frame).fontSize, controls: document.querySelectorAll('.edtr-print-sheet .pm-textbox-ui').length }; o.disconnect(); }); o.observe(document.body, { childList: true, subtree: true }); });
    const pdf = await output('PDF (.pdf)', 'text-box.pdf'); assert.ok((await fs.stat(pdf)).size > 10000);
    const printed = await page.evaluate(() => window.__textBoxPrint); assert.ok(printed); assert.equal(printed.text, updatedText); assert.equal(printed.controls, 0); assert.ok(Math.abs(parseFloat(printed.fontSize) - 14 * 96 / 72) < .1);
    // Explicit overflow: all text remains in the model and live frame, plus a visible warning.
    d = await openDialog(); const long = Array.from({ length: 100 }, (_, i) => `Overflow line ${i}`).join('\n'); await d.getByRole('textbox', { name: 'Text', exact: true }).fill(long); await d.getByRole('button', { name: 'Apply', exact: true }).click(); await settle();
    assert.equal(await frame.textContent(), long); assert.ok(await frame.evaluate(el => el.offsetHeight > 1122)); assert.ok(await box.locator('.pm-textbox-warning').isVisible());
    await page.screenshot({ path: path.join(dir, 'overflow-warning.png') });
    // Completely covered boxes remain selectable and editable through the common layer panel.
    const htmlBox = (text, layer) => `<span data-edtr-textbox="${JSON.stringify({ ...initial, text, layer }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></span>`;
    await loadHtml(`<p>FIXTURE COVERED BOX</p><p>${htmlBox('HIDDEN BOX', 0)}${htmlBox('COVER BOX', 1)}</p>`);
    await page.getByRole('menuitem', { name: 'View', exact: true }).click(); await page.getByRole('menuitemcheckbox', { name: 'Layers', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Layers', exact: true }); await panel.waitFor();
    const hidden = panel.getByRole('button', { name: 'HIDDEN BOX', exact: true }); await hidden.click(); await settle();
    assert.equal(await hidden.getAttribute('aria-pressed'), 'true'); assert.equal(await box.getAttribute('class').then(value => value.includes('is-selected')), true);
    await panel.getByRole('button', { name: 'Behind text', exact: true }).click(); await settle(); assert.equal((await attrs()).textPlane, 'behind');
    await box.getByRole('button', { name: 'Edit text box', exact: true }).click();
    d = page.getByRole('dialog', { name: 'Edit text box', exact: true }); assert.equal(await d.getByRole('textbox', { name: 'Text', exact: true }).inputValue(), 'HIDDEN BOX');
    await d.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.screenshot({ path: path.join(dir, 'covered-behind-selection.png') });
    await page.waitForTimeout(1100); await page.setViewportSize({ width: 390, height: 844 });
    for (const [locale, title, cancel] of [['tr', 'Metin kutusunu düzenle', 'İptal'], ['fr', 'Modifier la zone de texte', 'Annuler'], ['zh', '编辑文本框', '取消'], ['ar', 'تحرير مربع النص', 'إلغاء']]) {
      await page.context().addCookies([{ name: 'wordpad-locale', value: locale, url: process.env.BASE_URL || 'http://localhost:3107' }]);
      await page.reload(); const cover = page.locator('.ProseMirror .pm-textbox-wrapper').nth(1); await cover.locator('.pm-textbox-frame').waitFor();
      await cover.locator('.pm-textbox-frame').click(); await cover.getByRole('button', { name: title, exact: true }).click();
      d = page.getByRole('dialog', { name: title, exact: true }); const rect = await d.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 391, `${locale} mobile dialog bounds: ${JSON.stringify(rect)}`);
      if (locale === 'ar') { assert.equal(await page.locator('html').getAttribute('dir'), 'rtl'); await page.screenshot({ path: path.join(dir, 'mobile-arabic-dialog.png') }); }
      await d.getByRole('button', { name: cancel, exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log('PASS Insert, Delete/Backspace, plain text editing, body/move separation, Escape, move/resize undo, persistence, native editable DOCX multiline roundtrip, PDF font metrics, visible overflow, covered/behind layer selection and 4 localized mobile dialogs including RTL. Artifacts: ' + dir);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
