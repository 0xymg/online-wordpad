/* eslint-disable @typescript-eslint/no-require-imports */
/** Real editor/PDF regression for a repeated-header table split between columns and pages.
 * Set TABLE_WORD_COUNT=160 for the two-page variant and PDF_PYTHON to a Python with pdfplumber.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } = require('docx');
const { PDFDocument } = require('pdf-lib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const count = Number(process.env.TABLE_WORD_COUNT || 40), dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-column-table-live-'));
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 try {
  const p = text => new Paragraph({ children: [new TextRun(text)] }), cell = text => new TableCell({ children: [p(text)] });
  const doc = new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
   p('BEFORE_TABLE'), new Table({ width: { size: 3000, type: WidthType.DXA }, columnWidths: [1500, 1500], rows: [
    new TableRow({ tableHeader: true, children: [cell('HEADER_LEFT'), cell('HEADER_RIGHT')] }),
    new TableRow({ children: [cell('CELL_LONG_START ' + 'alpha bravo '.repeat(count) + ' CELL_LONG_END'), cell('SHORT_CELL')] }),
   ] }), p('AFTER_TABLE'),
  ] }] });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc)), main = await zip.file('word/document.xml').async('string');
  assert.match(main, /<\/w:sectPr>/);
  zip.file('word/document.xml', main.replace('</w:sectPr>', '<w:cols w:num="2" w:space="720" w:equalWidth="1"/></w:sectPr>'));
  const input = path.join(dir, 'source.docx'); await fs.writeFile(input, await zip.generateAsync({ type: 'nodebuffer' }));
  const page = await browser.newPage({ viewport: { width: 1450, height: 1200 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
  const editor = page.locator('.editor-shell .ProseMirror[contenteditable=true]');
  await editor.waitFor(); await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({ state: 'hidden' });
  // Read the current EditorView from the mounted editor for precise PM selection assertions.
  assert.equal(await editor.evaluate(root => {
   for (let el = root; el; el = el.parentElement) {
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    for (let fiber = key && el[key]; fiber; fiber = fiber.return) for (let hook = fiber.memoizedState, i = 0; hook && i < 300; hook = hook.next, i++) {
     const view = hook.memoizedState?.current;
     if (view?.state?.doc && typeof view.dispatch === 'function' && view.dom === root) { window.__tableTestView = view; return true; }
    }
   }
   return false;
  }), true, 'editor view available for coordinate assertions');
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(input);
  if (await page.getByRole('button', { name: 'Replace document', exact: true }).isVisible()) await page.getByRole('button', { name: 'Replace document', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.editor-shell .ProseMirror[contenteditable=true]')?.textContent.includes('CELL_LONG_END'));
  const original = await editor.evaluate(root => root.pmViewDesc.node.toJSON());
  await page.waitForFunction(() => document.querySelector('.ProseMirror [data-column-table-bands]') || document.querySelector('.ProseMirror[data-column-flow-error]'), null, { timeout: 30000 });
  assert.equal(await editor.getAttribute('data-column-flow-error'), null);
  await page.waitForTimeout(1000);
  assert.deepEqual(await editor.evaluate(root => root.pmViewDesc.node.toJSON()), original, 'layout must not change source');
  if (process.env.TABLE_LIVE_SCREENSHOT) await page.screenshot({ path: process.env.TABLE_LIVE_SCREENSHOT });
  // Click an empty physical continuation of the short cell, edit, and undo.
  const emptyBox = page.locator('[data-column-table-paint] [data-column-cell-empty="true"]').first();
  await emptyBox.waitFor(); const hit = await emptyBox.boundingBox(); assert.ok(hit);
  await page.mouse.click(hit.x + Math.min(8, hit.width / 2), hit.y + Math.min(8, hit.height / 2));
  assert.deepEqual(await editor.evaluate(root => root.pmViewDesc.node.toJSON()), original, 'blank-cell click must not mutate source');
  await page.keyboard.type('Z'); await page.waitForFunction(() => window.__tableTestView.state.doc.textContent.includes('Z'));
  await page.keyboard.press('Meta+z'); await page.waitForFunction(expected => JSON.stringify(window.__tableTestView.state.doc.toJSON()) === expected, JSON.stringify(original));
  await page.waitForFunction(() => document.querySelector('.editor-shell .ProseMirror[contenteditable=true] [data-column-table-line]'));
  // Drag within the same long cell from the first to the second column.
  const endpoints = await page.evaluate(() => {
   const choose = selector => { const el = document.querySelector(selector), node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(), range = document.createRange(); range.setStart(node, 1); range.setEnd(node, 2); const rect = range.getBoundingClientRect(); return { pos: window.__tableTestView.posAtDOM(node, 1), x: rect.left + 0.3, y: (rect.top + rect.bottom) / 2 }; };
   return [choose('td [data-column-table-line="0:0"]'), choose('td [data-column-table-line="0:1"]')];
  });
  await page.mouse.move(endpoints[0].x, endpoints[0].y); await page.mouse.down(); await page.mouse.move(endpoints[1].x, endpoints[1].y, { steps: 15 }); await page.mouse.up();
  const drag = await page.evaluate(() => window.__tableTestView.state.selection.toJSON());
  assert.equal(drag.type, 'text'); assert.ok(Math.abs(drag.anchor - endpoints[0].pos) <= 1 && Math.abs(drag.head - endpoints[1].pos) <= 1, JSON.stringify({ drag, endpoints }));
  assert.deepEqual(await editor.evaluate(root => root.pmViewDesc.node.toJSON()), original, 'text selection must not mutate source');
  // Drag across different header cells and verify CellSelection remains available.
  const headers = editor.locator('th [data-column-table-line="0:0"]'), first = await headers.first().boundingBox(), last = await headers.last().boundingBox();
  await page.mouse.move(first.x + 2, first.y + first.height / 2); await page.mouse.down(); await page.mouse.move(last.x + 2, last.y + last.height / 2, { steps: 15 }); await page.mouse.up();
  await page.waitForFunction(() => window.__tableTestView.state.selection.toJSON().type === 'cell', null, { timeout: 3000 });
  const cellDrag = await page.evaluate(() => window.__tableTestView.state.selection.toJSON()); assert.notEqual(cellDrag.anchor, cellDrag.head);
  await page.waitForFunction(() => document.querySelectorAll('[data-column-cell-selected="true"]').length >= 2);
  assert.deepEqual(await editor.evaluate(root => root.pmViewDesc.node.toJSON()), original, 'cell selection must not mutate source');
  await editor.evaluate(root => root.blur()); await page.waitForFunction(() => !document.querySelector('.editor-shell .ProseMirror')?.classList.contains('ProseMirror-focused'));
  assert.equal(await page.locator('[data-column-cell-selected="true"]').first().evaluate(el => getComputedStyle(el, '::after').content), 'none', 'cell selection paint hides on blur');
  await page.evaluate(() => window.__tableTestView.focus());
  await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export', exact: true }).hover();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('menuitem', { name: 'PDF (.pdf)', exact: true }).click()]);
  const output = path.join(dir, 'output.pdf'); await download.saveAs(output);
  if (process.env.TABLE_ARTIFACT_DIR) { await fs.mkdir(process.env.TABLE_ARTIFACT_DIR, { recursive: true }); await fs.copyFile(output, path.join(process.env.TABLE_ARTIFACT_DIR, 'output.pdf')); }
  assert.ok((await PDFDocument.load(await fs.readFile(output))).getPageCount() >= (count > 40 ? 2 : 1));
  assert.ok(await page.locator('[data-column-table-paint] [data-column-repeated-header]').count() >= 1);
  const pdfCheck = JSON.parse(execFileSync(process.env.PDF_PYTHON || 'python3', [path.resolve('scripts/compatibility/verify-column-table-pdf.py'), output, String(count)], { encoding: 'utf8' }));
  assert.deepEqual(pdfCheck.checks, { start: 1, end: 1, alpha: count, bravo: count, short: 1 });
  assert.deepEqual(errors, []);
  console.log(`PASS ${count}-pair live repeated-header table, editing, selection and shared PDF`);
 } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
