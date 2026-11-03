/* eslint-disable @typescript-eslint/no-require-imports */
/** Delay the first exporter module, switch active files, then verify the
 * in-flight note export uses the original settled PM snapshot and filename.
 * Chunk content matching handles Turbopack's coalesced development names. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),JSZip=require('jszip');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})}),dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-note-snapshot-'));let release;const barrier=new Promise(resolve=>release=resolve);
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1050}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
  const sec='sec_'+ '1'.repeat(32),note='nte_'+ 'a'.repeat(32),margins={top:1440,right:1440,bottom:1440,left:1440},numbering={restart:'continuous',start:1,format:'decimal'},model={version:5,id:'doc_'+ 'a'.repeat(32),finalSectionId:sec,sections:{[sec]:{page:{width:11906,height:16838,margins},start:'nextPage',numbering:{},running:{},columns:{kind:'equal',count:1,space:720,separator:false},flowDirection:'ltr'}},notes:{[note]:{kind:'endnote',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'FILE_A_NOTE_BODY'}]}]}}},notePolicy:{footnote:{...numbering,placement:'pageBottom'},endnote:{...numbering,placement:'documentEnd'}}};
  const html=`<div data-edtr-model="${JSON.stringify(model).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"><p>FILE_A_SOURCE <span data-edtr-note-reference="true" data-note-id="${note}">999</span></p></div>`;
  await page.addInitScript(html=>{if(localStorage.getItem('note-snapshot-seeded'))return;localStorage.setItem('note-snapshot-seeded','1');localStorage.setItem('wordpad-files',JSON.stringify([{id:'snapshot-a',name:'FILE_A',html},{id:'snapshot-b',name:'FILE_B',html:'<p>FILE_B_MUST_NOT_EXPORT_UNDER_A</p>'}]));localStorage.setItem('wordpad-active','snapshot-a');},html);
  let started=false,held=false,notify;const exporterHeld=new Promise(resolve=>notify=resolve);
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?|$)/,async route=>{
   const response=await route.fetch(),body=await response.text();
   if(started&&!held&&body.includes('lib/doc-export.ts')&&body.includes('"docToDocxBlob",')){held=true;notify();await barrier;}
   await route.fulfill({response,body});
  });
  await page.goto((process.env.BASE_URL||'http://localhost:3120')+'/pad');const editor=page.locator('.editor-shell .ProseMirror[contenteditable=true]');await editor.getByText('FILE_A_SOURCE',{exact:false}).waitFor();await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({state:'hidden'});await editor.locator('[data-note-owner-id]').waitFor();
  await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();started=true;const downloaded=page.waitForEvent('download',{timeout:45000});await page.getByRole('menuitem',{name:'Word (.docx)',exact:true}).click();
  let timer;try{await Promise.race([exporterHeld,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Exporter module was not intercepted; no race assertion was made')),15000)})]);}finally{clearTimeout(timer);}
  await editor.evaluate(root=>{
   let fiber;for(let el=root;el&&!fiber;el=el.parentElement){const key=Object.keys(el).find(key=>key.startsWith('__reactFiber$'));if(key)fiber=el[key];}if(!fiber)throw Error('React root missing');while(fiber.return)fiber=fiber.return;
   const todo=[fiber];while(todo.length){const current=todo.pop();if(!current)continue;if(typeof current.memoizedProps?.onOpenDocument==='function'&&current.memoizedProps.files?.some(file=>file.id==='snapshot-b')){current.memoizedProps.onOpenDocument('snapshot-b');return;}todo.push(current.child,current.sibling);}throw Error('Actual file-switch callback missing');
  });
  await editor.getByText('FILE_B_MUST_NOT_EXPORT_UNDER_A',{exact:true}).waitFor();release();const download=await downloaded;assert.equal(download.suggestedFilename(),'FILE_A.docx');const output=path.join(dir,'FILE_A.docx');await download.saveAs(output);
  const zip=await JSZip.loadAsync(await fs.readFile(output)),main=await zip.file('word/document.xml').async('string'),notes=await zip.file('word/endnotes.xml').async('string');assert.match(main,/FILE_A_SOURCE/);assert.doesNotMatch(main,/FILE_B_MUST_NOT_EXPORT_UNDER_A/);assert.match(main,/<w:endnoteReference\b/);assert.equal((notes.match(/FILE_A_NOTE_BODY/g)||[]).length,1);assert.deepEqual(errors,[]);assert.match(await editor.textContent(),/FILE_B_MUST_NOT_EXPORT_UNDER_A/);
  console.log(`PASS delayed exporter chunk + active-file switch retains original A filename/source/canonical note; artifacts ${dir}`);
 }finally{release();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
