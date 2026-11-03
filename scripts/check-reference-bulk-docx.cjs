/** Inactive guest documents must settle stale reference caches before DOCX export. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),JSZip=require('jszip');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-reference-bulk-'));try{
 const page=await browser.newPage({viewport:{width:1450,height:1050}}),base=process.env.BASE_URL||'http://localhost:3107';
 await page.goto(base+'/');await page.evaluate(()=>{
  const target='tgt_1234567890abcdef1234567890abcdef',field='fld_1234567890abcdef1234567890abcdef',toc='fld_abcdefabcdefabcdefabcdefabcdefab';
  const body=document.createElement('div'),heading=document.createElement('h1');heading.setAttribute('data-target-id',target);heading.textContent='LIVE_HEADING';body.append(heading);
  const marker=document.createElement('p');marker.setAttribute('data-edtr-toc',JSON.stringify({fieldId:toc,levels:[1,2,3]}));marker.textContent='CONTENTS';body.append(marker);
  const entry=document.createElement('p');entry.setAttribute('data-toc-owner-id',toc);entry.textContent='STALE_TOC_ENTRY';body.append(entry);
  const p=document.createElement('p'),ref=document.createElement('span');ref.setAttribute('data-edtr-reference','true');ref.setAttribute('data-field-id',field);ref.setAttribute('data-target-id',target);ref.setAttribute('data-display','text');ref.setAttribute('data-status','ok');ref.setAttribute('data-cached','STALE_REFERENCE');ref.textContent='STALE_REFERENCE';p.append(ref);body.append(p);
  localStorage.setItem('wordpad-files',JSON.stringify([{id:'inactive-a',name:'Inactive one',html:body.innerHTML},{id:'inactive-b',name:'Inactive two',html:body.innerHTML},{id:'active',name:'Active document',html:'<p>ACTIVE</p>'}]));localStorage.setItem('wordpad-active','active');
 });
 await page.goto(base+'/pad');const editor=page.locator('.editor-shell .ProseMirror[contenteditable=true]');await editor.waitFor();await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({state:'hidden'});
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),editor.evaluate(root=>{
  let fiber;for(let el=root;el&&!fiber;el=el.parentElement){const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));if(key)fiber=el[key]}while(fiber?.return)fiber=fiber.return;
  const todo=[fiber];let found;while(todo.length){const current=todo.pop();if(!current)continue;if(typeof current.memoizedProps?.onDownloadDocuments==='function' && Array.isArray(current.memoizedProps.files)){found=current.memoizedProps;break}todo.push(current.child,current.sibling)}
  if(!found)throw Error('Bulk download callback not found; root '+String(fiber?.tag));if(!found.files.some(f=>f.id==='inactive-a')||!found.files.some(f=>f.id==='inactive-b'))throw Error('Guest fixture documents not loaded');return found.onDownloadDocuments(['inactive-a','inactive-b']);
 })]);
 const archive=path.join(dir,'bulk.zip');await download.saveAs(archive);const zip=await JSZip.loadAsync(await fs.readFile(archive)),files=Object.keys(zip.files).filter(name=>name.endsWith('.docx'));assert.equal(files.length,2);
 for(const name of files){const inner=await JSZip.loadAsync(await zip.file(name).async('nodebuffer')),xml=await inner.file('word/document.xml').async('string');assert.doesNotMatch(xml,/STALE_REFERENCE|STALE_TOC_ENTRY/,name);assert.match(xml,/LIVE_HEADING/,name);assert.match(xml,/PAGEREF/,name);assert.match(xml,/REF EDH/,name);}
 console.log('PASS inactive bulk DOCX: stale text reference and TOC caches refreshed in both documents');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
