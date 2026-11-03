/** Regression: table node-view chrome must never be reparsed as document content. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } = require('docx');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-table-handle-'));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const p = text => new Paragraph({ children: [new TextRun(text)] });
    const cell = text => new TableCell({ children: [p(text)] });
    const doc = new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
      p('BEFORE_TABLE'), new Table({ width: { size: 3000, type: WidthType.DXA }, columnWidths: [1500, 1500], rows: [
        new TableRow({ tableHeader: true, children: [cell('HEADER_LEFT'), cell('HEADER_RIGHT')] }),
        new TableRow({ children: [cell('CELL_LONG_START ' + 'alpha bravo '.repeat(40) + ' CELL_LONG_END'), cell('SHORT_CELL')] }),
      ] }), p('AFTER_TABLE'),
    ] }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    const xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /<\/w:sectPr>/);
    zip.file('word/document.xml', xml.replace('</w:sectPr>', '<w:cols w:num="2" w:space="720" w:equalWidth="1"/></w:sectPr>'));
    const input = path.join(dir, 'source.docx');
    await fs.writeFile(input, await zip.generateAsync({ type: 'nodebuffer' }));
    const page = await browser.newPage({ viewport: { width: 1450, height: 1200 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
    const editor = page.locator('.editor-shell .ProseMirror[contenteditable=true]');
    await editor.waitFor();
    await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({ state: 'hidden' });
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(input);
    const replace = page.getByRole('button', { name: 'Replace document', exact: true });
    if (await replace.isVisible()) await replace.click();
    await page.waitForFunction(() => document.querySelector('.editor-shell .ProseMirror[contenteditable=true]')?.textContent.includes('CELL_LONG_END'));
    await page.waitForFunction(() => document.querySelector('.editor-shell .ProseMirror[contenteditable=true] [data-column-table-bands], .editor-shell .ProseMirror[contenteditable=true][data-column-flow-error]'), null, { timeout: 30000 });
    assert.equal(await editor.getAttribute('data-column-flow-error'), null);
    await page.waitForTimeout(1500);
    const model = () => editor.evaluate(root => root.pmViewDesc.node.toJSON());
    const before = await model();
    const table = before.content.find(node => node.type === 'table');
    assert.deepEqual(table.content.map(row => row.content.length), [2, 2], 'fixture starts with a 2×2 canonical table');
    await editor.locator('.pm-table-drag-handle').evaluate(handle => { handle.title = 'Forced presentation mutation'; });
    await page.waitForTimeout(500);
    assert.deepEqual(await model(), before, 'handle title mutation does not reparse the table');
    await page.getByRole('combobox', { name: 'Language', exact: true }).click();
    await page.getByRole('option', { name: 'العربية', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.editor-shell .ProseMirror[contenteditable=true] .pm-table-drag-handle')?.title === 'اسحب لنقل الجدول');
    await page.waitForTimeout(500);
    assert.deepEqual(await model(), before, 'locale title update does not alter the canonical document');
    assert.equal(await editor.getAttribute('data-column-flow-error'), null);
    const line = editor.locator('[data-column-table-line]').first();
    await line.scrollIntoViewIfNeeded();
    const box = await line.boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + Math.min(8, box.width / 2), box.y + box.height / 2);
    await page.keyboard.type('Z');
    await page.waitForFunction(() => document.querySelector('.editor-shell .ProseMirror[contenteditable=true]').pmViewDesc.node.textContent.includes('Z'));
    const edited = await model();
    assert.notDeepEqual(edited, before, 'real keyboard input edits the document');
    assert.match(JSON.stringify(edited.content.find(node => node.type === 'table')), /Z/, 'the typed character is in the canonical table');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.waitForFunction(expected => JSON.stringify(document.querySelector('.editor-shell .ProseMirror[contenteditable=true]').pmViewDesc.node.toJSON()) === expected, JSON.stringify(before));
    assert.deepEqual(await model(), before, 'undo restores the original table');
    assert.deepEqual(errors, []);
    console.log('PASS table bands: handle mutation, Arabic locale, cell typing, and undo preserve canonical table');
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
