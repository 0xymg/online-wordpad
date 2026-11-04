/* eslint-disable @typescript-eslint/no-require-imports */
/** Public mixed-document import, live navigation and real PDF download proof. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out=process.env.PROOF_OUTPUT_DIR?path.resolve(process.env.PROOF_OUTPUT_DIR):await fs.mkdtemp(path.join(os.tmpdir(),'edtr-reference-proof-'));await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1450},acceptDownloads:true,colorScheme:'light'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.noteProofErrors=[];document.addEventListener('edtr-note-error',e=>window.noteProofErrors.push({code:e.detail?.error?.code,message:e.detail?.error?.message}));});
  const base=process.env.BASE_URL||'http://localhost:3119';await page.goto(base+'/pad');const editor=page.locator('.editor-shell .ProseMirror[contenteditable=true]');
  await editor.waitFor();await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({state:'hidden'});await editor.fill('Import pending');
  const source=path.resolve('fixtures/compatibility/mixed.docx');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(source);await page.getByRole('button',{name:'Replace document',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.ProseMirror [data-toc-owner-id] [data-edtr-reference]')?.getAttribute('data-cached')==='2');
  const before=await editor.evaluate(root=>({notes:Object.keys(root.pmViewDesc.node.attrs.documentModel.notes).sort(),toc:root.querySelector('[data-toc-owner-id]')?.textContent,ids:[...root.querySelectorAll('[data-edtr-reference]')].map(n=>n.dataset.fieldId)}));assert.equal(before.notes.length,2);
  await editor.locator('[data-toc-owner-id] a').first().click();
  await page.waitForFunction(()=>{const n=getSelection()?.anchorNode,el=n instanceof Element?n:n?.parentElement;return el?.closest('h1,h2,h3,h4,h5,h6')?.textContent==='TARGET_HEADING';});
  await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.getByRole('menuitem',{name:'PDF (.pdf)',exact:true}).click()]);await download.saveAs(path.join(out,'mixed.pdf'));await page.keyboard.press('Escape');
  const after=await editor.evaluate(root=>({notes:Object.keys(root.pmViewDesc.node.attrs.documentModel.notes).sort(),toc:root.querySelector('[data-toc-owner-id]')?.textContent,ids:[...root.querySelectorAll('[data-edtr-reference]')].map(n=>n.dataset.fieldId),referenceError:root.dataset.referenceLayoutError||null,columnError:root.dataset.columnFlowError||null,noteErrors:window.noteProofErrors}));
  assert.deepEqual(after.notes,before.notes);assert.deepEqual(after.ids,before.ids);assert.equal(after.toc,before.toc);assert.equal(after.referenceError,null);assert.equal(after.columnError,null);assert.deepEqual(after.noteErrors,[]);assert.deepEqual(errors,[]);
  await editor.locator('[data-toc-owner-id]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{
    const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    const spans=[...document.querySelectorAll('span')];
    return spans.some(el=>el.textContent==='Saved'&&visible(el))&&!spans.some(el=>el.textContent==='Saving…'&&visible(el));
  });
  await page.screenshot({path:path.join(out,'references.png'),fullPage:true});
  const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  await fs.writeFile(path.join(out,'proof.json'),JSON.stringify({base_url:base,application_revision:process.env.APP_REVISION||null,captured_at:new Date().toISOString(),browser_version:browser.version(),source_sha256:await hash(source),pdf_sha256:await hash(path.join(out,'mixed.pdf')),screenshot_sha256:await hash(path.join(out,'references.png')),checks:{current_toc_page_two:true,toc_click_selects_actual_heading:true,note_and_field_identities_retained:true,pdf_export:true,zero_note_reference_or_column_errors:true,saved_state:true},facts:after},null,2)+'\n');
  console.log('PASS actual mixed DOCX import, current TOC2, user click selects heading, PDF download, stable note/field identities, saved screenshot and zero layout/note errors. '+out);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
