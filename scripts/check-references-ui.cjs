/* eslint-disable @typescript-eslint/no-require-imports */
/** Isolated guest reference UI, actual editing, identity and PDF GoTo acceptance. */
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-references-ui-'));
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } }); page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const base = process.env.BASE_URL || 'http://localhost:3107';
  await page.addInitScript(() => { window.__refReady=0; document.addEventListener('edtr-reference-layout-status', () => window.__refReady++); });
  await page.goto(base + '/pad'); const editor = page.locator('.editor-shell .ProseMirror[contenteditable=true]');
  await editor.waitFor(); await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({ state: 'hidden' });
  const source = path.join(dir, 'references.html');
  await fs.writeFile(source, '<p>CONTENTS HERE</p><h1>Alpha heading</h1><p>Bookmark words and body.</p><hr data-page-break="true"><h1>Beta heading</h1><h2>Beta detail</h2><p>INSERT HERE</p>');
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(source);
  await editor.getByText('Beta heading', { exact: true }).waitFor(); await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({ state: 'hidden' });
  async function open(label, title = label) { await page.getByRole('menuitem', { name: 'Insert', exact: true }).click(); await page.getByRole('menuitem', { name: label + '…', exact: true }).click(); const d = page.getByRole('dialog', { name: title, exact: true }); await d.waitFor(); return d; }
  let d = await open('Cross-reference');
  await d.evaluate(el => { let fiber = el[Object.keys(el).find(key => key.startsWith('__reactFiber$'))]; while (fiber && fiber.memoizedProps?.view?.dom !== document.querySelector('.editor-shell .ProseMirror[contenteditable=true]')) fiber = fiber.return; if (!fiber?.memoizedProps?.view) throw Error('View missing'); window.__refView = fiber.memoizedProps.view; window.__refTextSelection = window.__refView.state.selection.constructor; });
  await d.getByRole('button', { name: 'Cancel', exact: true }).click();
  async function selectText(text, length = 0) { await page.evaluate(({ text, length }) => { const v = window.__refView; let at; v.state.doc.descendants((node, pos) => { if (node.attrs.tocOwnerId) return false; if (at === undefined && node.isText && node.text.includes(text)) at = pos + node.text.indexOf(text); }); if (at === undefined) throw Error('Text missing ' + text); v.dispatch(v.state.tr.setSelection(window.__refTextSelection.create(v.state.doc, at, at + length)).scrollIntoView()); v.focus(); }, { text, length }); }
  async function update() { const before=await page.evaluate(() => window.__refReady); await page.getByRole('menuitem', { name: 'Insert', exact: true }).click(); await page.getByRole('menuitem', { name: 'Update references', exact: true }).click(); await page.waitForFunction(before => window.__refReady > before && !document.querySelector('.editor-shell .ProseMirror[data-reference-layout-error]') && !document.querySelector('.editor-shell [data-edtr-reference][data-status=pending]'), before); }
  await selectText('Bookmark words', 'Bookmark words'.length); d = await open('Bookmark'); await d.getByLabel('Bookmark name').fill('Useful words'); await d.getByRole('button', { name: 'Insert', exact: true }).click();
  assert.equal(await editor.locator('[data-edtr-bookmark=start]').count(), 1);
  await selectText('INSERT HERE'); d = await open('Cross-reference');
  await fs.writeFile(path.join(dir, "before-reference.json"), JSON.stringify(await page.evaluate(() => ({html:document.querySelector("[role=dialog]")?.outerHTML,doc:window.__refView.state.doc.toJSON()})), null, 2));
  const betaId = await d.getByLabel('Target', { exact: true }).locator('option').filter({ hasText: 'Beta heading' }).getAttribute('value');
  await d.getByLabel('Target', { exact: true }).selectOption(betaId); await d.getByLabel('Show', { exact: true }).selectOption('page'); await d.getByRole('button', { name: 'Insert', exact: true }).click(); await update();
  const ref = editor.locator(`[data-edtr-reference][data-target-id="${betaId}"][data-display=page]`);
  assert.equal(await ref.textContent(), '2');
  await selectText('CONTENTS HERE', 'CONTENTS HERE'.length); d = await open('Table of contents'); await d.getByRole('button', { name: 'Insert', exact: true }).click(); await update();
  assert.equal(await editor.locator('[data-toc-owner-id]').count(), 3);
  assert.ok((await editor.locator('[data-toc-owner-id]').allTextContents()).some(text => text.includes('Beta heading') && text.includes('2')));
  await selectText('Alpha heading', 'Alpha heading'.length); await page.keyboard.type('Renamed alpha'); await update();
  await fs.writeFile(path.join(dir, 'after-rename.json'), JSON.stringify(await page.evaluate(() => ({html:window.__refView.dom.outerHTML,doc:window.__refView.state.doc.toJSON(),selection:window.__refView.state.selection.toJSON()})), null, 2));
  await page.waitForFunction(() => [...document.querySelectorAll('.editor-shell [data-toc-owner-id]')].some(el => el.textContent.includes('Renamed alpha')));
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'; await editor.focus(); await page.keyboard.press(mod + '+z'); await update();
  assert.ok((await editor.locator('[data-toc-owner-id]').allTextContents()).some(text => text.includes('Alpha heading')));
  await selectText('INSERT HERE'); d = await open('Caption'); await d.getByLabel('Caption text').fill('Test artwork'); await d.getByRole('button', { name: 'Insert', exact: true }).click(); await update();
  assert.match(await editor.locator('[data-target-kind=caption]').textContent(), /Figure\s*1\s*Test artwork/);
  d = await open('Cross-reference');
  const captionId = await editor.locator('[data-target-kind=caption]').getAttribute('data-target-id');
  await d.getByLabel('Target', { exact: true }).selectOption(captionId); await d.getByLabel('Show', { exact: true }).selectOption('number');
  await d.getByLabel('Target', { exact: true }).selectOption(betaId); assert.equal(await d.getByLabel('Show', { exact: true }).inputValue(), 'text');
  await d.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export', exact: true }).hover();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('menuitem', { name: 'PDF (.pdf)', exact: true }).click()]);
  const output = path.join(dir, 'references.pdf'); await download.saveAs(output);
  execFileSync(process.env.PDF_PYTHON || 'python3', ['-c', `
from pypdf import PdfReader
import sys
r=PdfReader(sys.argv[1]); assert len(r.pages)==2
text='\\n'.join(p.extract_text() for p in r.pages)
assert 'Figure' in text and 'Test artwork' in text
links=[]
for p in r.pages:
 for a in p.get('/Annots',[]):
  a=a.get_object(); action=a.get('/A',{})
  if action.get('/S')=='/GoTo': links.append(action['/D'])
  assert not(action.get('/S')=='/URI' and '#edtr-target-' in action.get('/URI',''))
assert len(links)>=4, len(links)
assert any(dest[0].idnum==r.pages[1].indirect_reference.idnum for dest in links)
`, output]);
  await page.screenshot({ path: path.join(dir, 'references.png') });
  // Replacing a target with a same-named heading must not rebind existing fields.
  await page.evaluate(id => { const v=window.__refView; let found; v.state.doc.descendants((n,p) => { if(n.type.name==='heading' && n.attrs.targetId===id) found={n,p}; }); if(!found) throw Error('Heading missing'); v.dispatch(v.state.tr.replaceWith(found.p,found.p+found.n.nodeSize,v.state.schema.nodes.heading.create({level:1},v.state.schema.text(found.n.textContent)))); }, betaId);
  await page.waitForFunction(id => [...document.querySelectorAll('.editor-shell [data-edtr-reference]')].some(el => el.getAttribute('data-target-id')===id && el.getAttribute('data-status')==='missing-target'), betaId);
  await editor.focus(); await page.keyboard.press(mod+'+z');
  await page.waitForFunction(id => [...document.querySelectorAll('.editor-shell [data-edtr-reference]')].some(el => el.getAttribute('data-target-id')===id && el.getAttribute('data-status')==='ok'), betaId);
  // A normal field click selects it; the dialog edits that same field identity.
  await ref.filter({hasNot:page.locator('a')}).last().click();
  d=await open('Cross-reference'); await d.getByLabel('Show',{exact:true}).selectOption('text'); await d.getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(id => [...document.querySelectorAll('.editor-shell [data-edtr-reference]')].some(el => el.getAttribute('data-target-id')===id && el.getAttribute('data-display')==='text' && el.textContent==='Beta heading'), betaId);
  await page.evaluate(() => window.__refView.setProps({editable:()=>false}));
  d=await open('Caption'); assert.ok(await d.getByLabel('Caption text').isDisabled()); assert.ok(await d.getByRole('button',{name:'Insert',exact:true}).isDisabled()); await d.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.evaluate(() => window.__refView.setProps({editable:()=>true}));
  await page.context().addCookies([{name:'wordpad-locale',value:'ar',url:base}]); await page.reload(); await editor.waitFor(); await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({state:'hidden'});
  await page.setViewportSize({width:390,height:844}); await page.getByRole('menuitem',{name:'إدراج',exact:true}).click(); await page.getByRole('menuitem',{name:'إسناد ترافقي…',exact:true}).click(); d=page.getByRole('dialog',{name:'إسناد ترافقي',exact:true}); await d.waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl'); const rect=await d.boundingBox(); assert.ok(rect && rect.x>=0 && rect.x+rect.width<=390);
  await page.screenshot({path:path.join(dir,'arabic-mobile.png')}); await d.getByRole('button',{name:'إلغاء',exact:true}).click();
  assert.deepEqual(errors, []); console.log(JSON.stringify({ result: 'PASS reference UI, bookmark, live TOC, rename/undo, caption and PDF GoTo links', artifacts: dir }));
 } catch (error) { console.error('Artifacts:', dir); throw error; } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
