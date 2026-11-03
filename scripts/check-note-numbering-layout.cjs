/* eslint-disable @typescript-eslint/no-require-imports */
/** Actual page geometry at 9→10/99→100 labels and user-selected zoom. */
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-note-numbering-'));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    for (const start of [8, 98]) {
      const sec = 'sec_' + '1'.repeat(32), ids = Array.from({ length: 4 }, (_, i) => 'nte_' + (i + 1).toString(16).padStart(32, '0'));
      const numbering = { restart: 'continuous', start, format: 'decimal' };
      const model = { version: 5, id: 'doc_' + 'a'.repeat(32), finalSectionId: sec, sections: { [sec]: { page: { width: 12240, height: 15840, margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }, start: 'nextPage', numbering: {}, running: {}, columns: { kind: 'equal', count: 1, space: 720, separator: false }, flowDirection: 'ltr' } }, notePolicy: { footnote: { ...numbering, placement: 'pageBottom' }, endnote: { ...numbering, placement: 'documentEnd' } }, notes: Object.fromEntries(ids.map((id, i) => [id, { kind: 'footnote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'NOTE_' + i + ' ' + 'A readable note body with several words. '.repeat(3) }] }] } }])) };
      const enc = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const file = path.join(dir, 'labels-' + start + '.html');
      await fs.writeFile(file, `<div data-edtr-model="${enc(JSON.stringify(model))}">${ids.map((id, i) => `<p>OWNER_${i} <span data-edtr-note-reference="true" data-note-id="${id}">…</span></p>`).join('')}</div>`);
      const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
      await page.goto((process.env.BASE_URL || 'http://localhost:3120') + '/pad');
      const editor = page.locator('.editor-shell .ProseMirror[contenteditable=true]');
      await editor.waitFor(); await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({ state: 'hidden' });
      await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
      const settled = () => page.waitForFunction(() => document.querySelectorAll('.pm-footnote-backlink').length === 4 && !document.querySelector('[data-note-layout-error]'));
      await settled();
      const labels = await editor.locator('[data-edtr-note-reference]').allTextContents();
      assert.deepEqual(labels.map(s => s.trim()), ids.map((_, i) => String(start + i)));
      const geometry = () => page.locator('.pm-footnote-layer').evaluate(layer => {
        const host = layer.parentElement, box = host.getBoundingClientRect(), scale = box.width / parseFloat(getComputedStyle(host).width);
        return [...layer.querySelectorAll('.pm-footnote-line')].map(line => { const rect = line.getBoundingClientRect(); return { text: line.textContent, x: (rect.left - box.left) / scale, y: (rect.top - box.top) / scale, width: rect.width / scale, height: rect.height / scale }; });
      });
      const initial = await geometry();
      for (const zoom of [75, 125, 100]) {
        await page.getByRole('combobox', { name: 'Zoom', exact: true }).click();
        await page.getByRole('option', { name: zoom + '%', exact: true }).click();
        await settled();
        const next = await geometry(); assert.equal(next.length, initial.length);
        for (let i = 0; i < next.length; i++) {
          assert.equal(next[i].text, initial[i].text);
          for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(next[i][key] - initial[i][key]) < 1, `${start}/${zoom}/${i}/${key}: ${next[i][key]} vs ${initial[i][key]}`);
        }
      }
      await page.screenshot({ path: path.join(dir, 'labels-' + start + '.png'), fullPage: true });
      await page.close();
    }
    console.log('PASS actual 9→10/99→100 note labels and invariant physical note geometry at 75/125/100% zoom; ' + dir);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
