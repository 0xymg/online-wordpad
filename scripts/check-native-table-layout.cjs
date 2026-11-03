/* eslint-disable @typescript-eslint/no-require-imports */
/** Native table inheritance, compatibility placement, and direct override UI regression. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-native-table-'));
  const source = await fs.readFile(path.resolve('fixtures/compatibility/table-columns.docx'));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const cases = [
    { name: 'legacy', margin: -5.65 },
    { name: 'modern', mode: '15', margin: 0 },
    { name: 'unknown', mode: null, margin: 0 },
    { name: 'indent', indent: true, margin: 30.35 },
    { name: 'center', center: true, margin: 'auto' },
    { name: 'direct-nil', nil: true, margin: -5.4 },
  ];
  try {
    for (const fixture of cases.filter(fixture => !process.env.CASE || process.env.CASE === fixture.name)) {
      const zip = await JSZip.loadAsync(source);
      if (fixture.mode !== undefined) {
        const settings = await zip.file('word/settings.xml').async('string');
        zip.file('word/settings.xml', settings.replace(/<w:compatSetting w:name="compatibilityMode"[^>]*\/>/, fixture.mode === null ? '' : '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>'));
      }
      let xml = await zip.file('word/document.xml').async('string');
      if (fixture.indent) xml = xml.replace('<w:tblPr>', '<w:tblPr><w:tblInd w:w="720" w:type="dxa"/>');
      if (fixture.center) xml = xml.replace('<w:tblPr>', '<w:tblPr><w:jc w:val="center"/>');
      if (fixture.nil) xml = xml.replace('<w:tcPr>', '<w:tcPr><w:tcBorders><w:left w:val="nil"/></w:tcBorders>');
      zip.file('word/document.xml', xml);
      const file = path.join(dir, fixture.name + '.docx');
      await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
      const context = await browser.newContext();
      try {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto((process.env.BASE_URL || 'http://localhost:3120') + '/pad');
        await page.locator('.ProseMirror').waitFor();
        await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({ state: 'hidden' });
        await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
        await page.locator('.editor-shell .ProseMirror[contenteditable=true]').getByText('TABLE_A', { exact: true }).first().waitFor();
        const values = await page.locator('.editor-shell .ProseMirror[contenteditable=true] table').first().evaluate(table => {
          const cell = table.querySelector('td,th'), style = getComputedStyle(cell);
          return { margin: table.style.marginLeft, border: style.borderRightWidth, color: style.borderRightColor, left: style.borderLeftWidth, padding: style.paddingLeft, wrapperMargin: getComputedStyle(table.closest('.pm-table-wrapper')).marginTop, inline: cell.style.cssText };
        });
        if (fixture.margin === 'auto') assert.equal(values.margin, 'auto', fixture.name);
        else assert(Math.abs(parseFloat(values.margin) - fixture.margin) < .02, fixture.name + ': ' + JSON.stringify(values));
        assert.equal(values.color, 'rgb(0, 0, 0)', fixture.name);
        assert(Math.abs(parseFloat(values.border) - 2 / 3) < .4, fixture.name + ' inherited half-point border');
        assert(Math.abs(parseFloat(values.padding) - 7.2) < .05, fixture.name + ' inherited padding');
        assert.equal(parseFloat(values.wrapperMargin), 0, fixture.name + ' native table has no synthetic wrapper gap');
        if (fixture.nil) assert.equal(parseFloat(values.left), 0, 'direct nil overrides inherited grid: ' + JSON.stringify(values));
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log('PASS native table style borders/margins; explicit legacy, modern and unknown modes; indent/center/direct nil overrides');
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
