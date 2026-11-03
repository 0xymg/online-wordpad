/* eslint-disable @typescript-eslint/no-require-imports */
/** Actual File > Export paths retain canonical notes in text formats. */
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-note-text-ui-'));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.BASE_URL || 'http://localhost:3120') + '/pad');
    const editor = page.locator('.editor-shell .ProseMirror[contenteditable=true]');
    await editor.waitFor(); await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({ state: 'hidden' });
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(path.resolve('fixtures/notes/native-endnote-supported.docx'));
    await editor.locator('[data-edtr-note-reference]').waitFor();
    for (const [label, extension] of [['Plain text (.txt)', 'txt'], ['Markdown (.md)', 'md'], ['Rich Text (.rtf)', 'rtf']]) {
      await page.getByRole('menuitem', { name: 'File', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Export', exact: true }).hover();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: label, exact: true }).click()]);
      const file = path.join(dir, 'notes.' + extension); await download.saveAs(file);
      const raw = await fs.readFile(file, 'utf8'), text = extension === 'md' ? raw.replace(/\\_/g, '_') : raw;
      assert.equal(text.split('NOTE_LONG_END').length - 1, 1, extension + ' note body once');
      for (let i = 0; i < 450; i++) assert.equal((text.match(new RegExp('\\bflow' + i + '\\b', 'g')) || []).length, 1, extension + ' word ' + i);
      assert.ok(extension === 'md' ? raw.includes('[^edtr-note-1]:') : raw.includes('[1]'), extension + ' owner/body key');
    }
    assert.deepEqual(errors, []);
    console.log('PASS actual TXT/MD/RTF downloads: one canonical rich endnote, all 450 words once, matching owner key; ' + dir);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
