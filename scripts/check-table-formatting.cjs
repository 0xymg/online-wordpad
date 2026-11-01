/** End-to-end table formatting/undo/persistence/DOCX regression, isolated browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { Document, Packer, Paragraph, Table, TableRow, TableCell } = require('docx');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-table-test-'));
  const cell = (text, span = 1) => new TableCell({ columnSpan: span, children: [new Paragraph(text)] });
  const file = path.join(dir, 'table.docx');
  await fs.writeFile(file, await Packer.toBuffer(new Document({ sections: [{ children: [new Table({ columnWidths: [1800, 2700, 3600], rows: [new TableRow({ children: [cell('MERGED A', 2), cell('B')] }), new TableRow({ children: [cell('C'), cell('D'), cell('E')] })] })] }] })));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
    const editor = page.locator('.ProseMirror');
    async function open(filename) {
      await editor.fill('Import pending');
      await page.getByRole('menuitem', { name: 'File', exact: true }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('menuitem', { name: /^Open…/ }).click();
      await (await chooser).setFiles(filename);
      await page.getByRole('button', { name: 'Replace document', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent.includes('MERGED A'));
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    }
    async function properties() {
      await page.getByRole('menuitem', { name: 'Table', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Table properties', exact: true }).click();
      await page.getByRole('dialog').waitFor();
    }
    const first = page.locator('.ProseMirror td,.ProseMirror th').filter({ hasText: 'MERGED A' });
    await open(file); await first.click(); await properties();
    await page.getByLabel('Cell background', { exact: true }).selectOption('#dbeafe');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.notEqual(await first.evaluate(e => e.style.backgroundColor), 'rgb(219, 234, 254)');
    await first.click(); await properties();
    await page.getByLabel('Cell background', { exact: true }).selectOption('#dbeafe');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.equal(await first.evaluate(e => e.style.backgroundColor), 'rgb(219, 234, 254)');
    assert.notEqual(await page.locator('.ProseMirror td').filter({ hasText: /^B$/ }).evaluate(e => e.style.backgroundColor), 'rgb(219, 234, 254)');
    await editor.press('ControlOrMeta+z');
    assert.notEqual(await first.evaluate(e => e.style.backgroundColor), 'rgb(219, 234, 254)');
    await editor.press('ControlOrMeta+Shift+z');
    assert.equal(await first.evaluate(e => e.style.backgroundColor), 'rgb(219, 234, 254)');
    await first.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Select entire table', exact: true }).click();
    await properties();
    await page.getByLabel('Vertical alignment', { exact: true }).selectOption('middle');
    await page.getByLabel('Cell padding (pt)', { exact: true }).fill('6');
    await page.getByLabel('Minimum row height (cm)', { exact: true }).fill('1.2');
    await page.getByLabel('Cell borders', { exact: true }).selectOption('all');
    await page.getByLabel('Border width', { exact: true }).selectOption('1.5');
    await page.getByLabel('Table alignment', { exact: true }).selectOption('center');
    await page.getByLabel('Column widths', { exact: true }).selectOption('equal');
    await page.getByLabel('Repeat first row on each page', { exact: true }).selectOption('yes');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    const facts = await page.locator('.ProseMirror td').evaluateAll(cells => cells.map(c => ({ align: c.style.verticalAlign, padding: c.style.paddingTop, border: c.style.borderTopWidth, width: c.getAttribute('data-colwidth') })));
    assert.ok(facts.every(c => c.align === 'middle' && c.padding === '6pt' && c.border === '1.5pt'));
    assert.equal(await first.getAttribute('colspan'), '2');
    await page.waitForFunction(() => (localStorage.getItem('wordpad-files') || '').includes('tblHeader'));
    await page.reload(); await editor.waitFor();
    await page.waitForFunction(() => document.querySelector('.ProseMirror td')?.style.paddingTop === '6pt');
    await page.screenshot({ path: path.join(dir, 'formatted.png'), fullPage: true });
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Export', exact: true }).hover();
    const event = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Word (.docx)', exact: true }).click();
    const output = path.join(dir, 'formatted.docx'); await (await event).saveAs(output);
    const zip = await JSZip.loadAsync(await fs.readFile(output)), xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /w:vAlign w:val="center"/); assert.match(xml, /w:tblHeader w:val="1"/);
    assert.match(xml, /w:sz="12"/); assert.match(xml, /w:w="120"/); assert.match(xml, /w:fill="dbeafe"/i);
    assert.match(xml, /w:jc w:val="center"/); assert.match(xml, /w:trHeight w:val="680"/);
    await open(output);
    assert.equal(await first.evaluate(e => e.style.backgroundColor), 'rgb(219, 234, 254)');
    assert.equal(await first.evaluate(e => e.style.paddingTop), '6pt');
    assert.equal(await first.getAttribute('colspan'), '2');
    assert.deepEqual(errors, []);
    console.log('PASS table formatting: selected cells, cancel, undo/redo, merged columns, borders, padding, alignment, row height, repeat header, persistence and DOCX roundtrip. Artifacts: ' + dir);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
