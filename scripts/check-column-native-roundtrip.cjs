/* eslint-disable @typescript-eslint/no-require-imports */
/** Round-trip the frozen actual-Word probe source through the app's DOCX importer/exporter. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const dir = await fs.mkdtemp(path.join(os.tmpdir(),'edtr-column-native-'));
 try {
  const file=path.resolve('fixtures/columns/column-page-break-controls.docx');
  const source=await JSZip.loadAsync(await fs.readFile(file));
  const page=await browser.newPage({viewport:{width:1450,height:1050}});
  const inspect=async xml=>page.evaluate(xml=>{const d=new DOMParser().parseFromString(xml,'application/xml'),w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';return {columns:[...d.getElementsByTagNameNS(w,'cols')].filter(e=>['sectPr'].includes(e.parentElement?.localName)).map(e=>({num:e.getAttributeNS(w,'num'),space:e.getAttributeNS(w,'space'),sep:e.getAttributeNS(w,'sep')})),breaks:[...d.getElementsByTagNameNS(w,'br')].map(e=>e.getAttributeNS(w,'type')).filter(Boolean)}},xml);
  const expected=await inspect(await source.file('word/document.xml').async('string'));
  await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad');
  const editor=page.locator('.editor-shell .ProseMirror[contenteditable="true"]');await editor.waitFor();await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({state:'hidden'});
  await editor.fill('pending');
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
  await page.getByRole('button',{name:'Replace document',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.editor-shell .ProseMirror[contenteditable="true"]')?.textContent.includes('COLUMN'));
  const count=await editor.locator('br[data-edtr-column-break]').count();
  assert.equal(count,expected.breaks.filter(x=>x==='column').length,'imported column break atoms');
  await page.getByRole('menuitem',{name:'File',exact:true}).click();
  await page.getByRole('menuitem',{name:'Export',exact:true}).hover();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('menuitem',{name:'Word (.docx)',exact:true}).click()]);
  const outputPath=path.join(dir,'output.docx');await download.saveAs(outputPath);
  const output=await JSZip.loadAsync(await fs.readFile(outputPath));
  const actual=await inspect(await output.file('word/document.xml').async('string'));
  assert.deepEqual(actual.breaks.sort(),expected.breaks.sort(),'native break types survive');
  assert.deepEqual(actual.columns,expected.columns,'native section columns survive');
  console.log('PASS frozen column-break probe DOCX import/export: '+count+' column breaks and '+actual.columns.length+' section column settings');
 } finally { await browser.close(); await fs.rm(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1});
