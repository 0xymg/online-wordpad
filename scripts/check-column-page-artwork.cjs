/* eslint-disable @typescript-eslint/no-require-imports */
/** Full page artwork must survive column-root clipping in the editor and PDF. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-column-page-artwork-'));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__columnReady = 0;
      document.addEventListener('edtr-column-flow-ready', event => {
        if (event.target?.getAttribute('contenteditable') === 'true') window.__columnReady++;
      });
    });
    await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
    const editor = page.locator('.editor-shell .ProseMirror[contenteditable=true]');
    await editor.waitFor();
    const colors = await page.evaluate(() => ['#ff0000', '#00ff00'].map(color => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20;
      const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 20, 20);
      return canvas.toDataURL();
    }));
    const attr = value => JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const layout = { width: 12240, height: 15840, margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, section: '<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:cols w:num="2" w:space="720"/></w:sectPr>' };
    const image = (index, x, y) => `<img src="${colors[index]}" alt="EDGE_${index}" data-width="20px" data-aspect-ratio="1" data-position="page" data-x="${x}" data-y="${y}">`;
    const box = { text: 'EDGE BOX', x: 0, y: 1024, width: '120px', height: 32, background: '#0000ff', borderColor: '#0000ff', color: '#ffffff', padding: 2 };
    const file = path.join(dir, 'edges.html');
    await fs.writeFile(file, `<div data-edtr-layout="${attr(layout)}"><p>PAGE_ONE ${image(0, 0, 0)}</p><hr data-page-break="true"><p>PAGE_TWO ${image(1, 796, 1036)}<span data-edtr-textbox="${attr(box)}"></span></p></div>`);
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
    await page.waitForFunction(() => window.__columnReady > 0 || document.querySelector('[data-column-flow-error]'));
    assert.equal(await editor.getAttribute('data-column-flow-error'), null);
    const sheets = page.locator('.editor-shell .pm-section-sheet');
    assert.equal(await sheets.count(), 2);
    for (const [index, x, y] of [[0, 0, 0], [1, 796, 1036]]) {
      const image = editor.locator(`img[alt="EDGE_${index}"]`);
      await image.scrollIntoViewIfNeeded();
      const position = await image.evaluate((img, index) => {
        const frame = img.closest('.pm-image-frame'), r = frame.getBoundingClientRect();
        const sheet = img.closest('.pm-page').querySelectorAll('.pm-section-sheet')[index].getBoundingClientRect();
        return { x: r.left - sheet.left, y: r.top - sheet.top, width: r.width, height: r.height,
          hit: frame.contains(document.elementFromPoint(r.left + 2, r.top + 2)) && frame.contains(document.elementFromPoint(r.right - 2, r.bottom - 2)) };
      }, index);
      assert.ok(Math.abs(position.x - x) < 1 && Math.abs(position.y - y) < 1 && position.hit, JSON.stringify(position));
      await sheets.nth(index).screenshot({ path: path.join(dir, `page-${index + 1}.png`) });
    }
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Export', exact: true }).hover();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('menuitem', { name: 'PDF (.pdf)', exact: true }).click()]);
    await download.saveAs(path.join(dir, 'edges.pdf'));
    execFileSync(process.env.PDF_PYTHON || 'python3', ['-c', `
from pathlib import Path
from pypdf import PdfReader
from PIL import Image
import sys
root=Path(sys.argv[1]); pdf=PdfReader(root/'edges.pdf')
assert len(pdf.pages)==2
for i, x, y, expected in [(0,10,10,(255,0,0)),(1,806,1046,(0,255,0)),(1,10,1050,(0,0,255))]:
    for label, im in [('pdf',pdf.pages[i].images[0].image),('screen',Image.open(root/f'page-{i+1}.png'))]:
        im=im.convert('RGB'); pixel=im.getpixel((round(x*im.width/816),round(y*im.height/1056)))
        assert max(abs(a-b) for a,b in zip(pixel,expected))<8,(label,i,x,y,pixel)
assert 'EDGE BOX' in pdf.pages[1].extract_text()
`, dir]);
    assert.deepEqual(errors, []);
    console.log('PASS first/last page-edge images and margin text box remain visible and hittable in columns and PDF. Artifacts: ' + dir);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
