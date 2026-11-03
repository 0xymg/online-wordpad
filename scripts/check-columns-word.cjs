/* eslint-disable @typescript-eslint/no-require-imports */
/** Export frozen Word probes through an isolated EDTR guest browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { PDFDocument } = require('pdf-lib');
(async () => {
  const base = path.resolve('fixtures/columns');
  const manifest = JSON.parse(await fs.readFile(path.join(base, 'manifest.json'), 'utf8'));
  const references = JSON.parse(await fs.readFile(path.join(base, 'references/report.json'), 'utf8'));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-columns-word-'));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const results = [];
  try {
    for (const fixture of manifest.fixtures.filter(item => !process.argv[2] || item.id === process.argv[2])) {
      const page = await browser.newPage({ viewport: { width: 1450, height: 1300 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        const source = path.join(base, fixture.source);
        assert.equal(createHash('sha256').update(await fs.readFile(source)).digest('hex'), fixture.source_sha256);
        await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
        const editor = page.locator('.editor-shell .ProseMirror[contenteditable=true]');
        await editor.waitFor();
        await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({ state: 'hidden' });
        await page.locator('input[type=file][accept*=".docx"]').setInputFiles(source);
        await page.waitForFunction(marker => document.querySelector('.ProseMirror[contenteditable=true]')?.textContent.includes(marker), fixture.source_facts.markers_once[0]);
        await page.waitForFunction(() => document.querySelector('.ProseMirror [data-column-fragment]') || document.querySelector('.ProseMirror[data-column-flow-error]'), null, { timeout: 30000 });
        await page.waitForTimeout(500);
        assert.equal(await editor.getAttribute('data-column-flow-error'), null);
        const content = await editor.textContent();
        for (const marker of fixture.source_facts.markers_once) assert.equal(content.split(marker).length - 1, 1, marker);
        await page.getByRole('menuitem', { name: 'File', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Export', exact: true }).hover();
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('menuitem', { name: 'PDF (.pdf)', exact: true }).click()]);
        const pdfPath = path.join(dir, fixture.id + '.pdf');
        await download.saveAs(pdfPath);
        await page.screenshot({ path: path.join(dir, fixture.id + '.png') });
        const pages = (await PDFDocument.load(await fs.readFile(pdfPath))).getPageCount();
        const reference = (Array.isArray(references) ? references : references.fixtures).find(item => item.id === fixture.id);
        assert.equal(pages, reference.page_count, fixture.id + ' physical page count');
        assert.deepEqual(errors, []);
        results.push({ id: fixture.id, status: 'PAGE_COUNT_PASS', pages, pdfPath, source_sha256: fixture.source_sha256 });
      } catch (error) {
        await page.screenshot({ path: path.join(dir, fixture.id + '-failure.png') }).catch(() => {});
        results.push({ id: fixture.id, status: 'FAIL', reason: String(error), errors });
      } finally { await page.close(); }
    }
    await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ artifacts: dir, results }, null, 2));
    if (results.some(item => item.status === 'FAIL')) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
