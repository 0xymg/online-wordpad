/* eslint-disable @typescript-eslint/no-require-imports */
/** Production column placement of imported paragraph pagination constraints. */
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {Document,Packer,Paragraph,TextRun,HeadingLevel}=require('docx');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-column-paragraph-editor-')),browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:1450,height:1300}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad');const editor=page.locator('.ProseMirror[contenteditable=true]');await editor.waitFor();await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({state:'hidden'});
 const lines=(prefix,n,options={})=>new Paragraph({...options,spacing:{before:0,after:0,line:240},children:Array.from({length:n},(_,i)=>new TextRun({text:`${prefix}${String(i).padStart(2,'0')}`,size:20,...(i?{break:1}:{})}))});
 const tests=[
  {name:'heading',paras:[lines('FILL',8),lines('HEAD',1,{heading:HeadingLevel.HEADING_1}),lines('FOLLOW',3)]},
  {name:'keep-lines',paras:[lines('FILL',8),lines('KEEP',3,{keepLines:true})]},
  {name:'widow',paras:[lines('FILL',9),lines('WIDOW',14)]},
  {name:'page-before',paras:[lines('BEFORE',2),lines('AFTER',2,{pageBreakBefore:true})]},
  {name:'oversized',paras:[lines('FILL',2),lines('LONG',25,{keepLines:true})]},
 ];
 for(const test of tests){const file=path.join(dir,test.name+'.docx');await fs.writeFile(file,await Packer.toBuffer(new Document({sections:[{properties:{page:{size:{width:6000,height:3000},margin:{top:300,right:300,bottom:300,left:300}}},children:test.paras}]})));
  await editor.fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(marker=>document.querySelector('.ProseMirror[contenteditable=true]')?.textContent.includes(marker),test.name==='heading'?'FOLLOW02':test.name==='keep-lines'?'KEEP02':test.name==='widow'?'WIDOW13':test.name==='page-before'?'AFTER01':'LONG24');
  await page.getByRole('menuitem',{name:'Insert',exact:true}).click();await page.getByRole('menuitem',{name:'Section layout…',exact:true}).click();const d=page.getByRole('dialog',{name:'Section layout'});await d.getByLabel('Equal columns').selectOption('2');await editor.evaluate(el=>{window.__paragraphFlowReady=false;el.addEventListener('edtr-column-flow-ready',()=>{window.__paragraphFlowReady=true},{once:true})});await d.getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(()=>window.__paragraphFlowReady||document.querySelector('.ProseMirror[contenteditable=true]')?.hasAttribute('data-column-flow-error'),null,{timeout:30000});await page.waitForTimeout(500);const diagnostic=await editor.getAttribute('data-column-flow-error');assert.equal(diagnostic,null,`${test.name}: ${diagnostic}`);
  const regions=await editor.evaluate(el=>{const result={};for(const p of el.querySelectorAll('p,h1,h2,h3,h4,h5,h6')){const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))for(const match of node.data.matchAll(/(?:FILL|HEAD|FOLLOW|KEEP|WIDOW|BEFORE|AFTER|LONG)\d\d/g)){const fragment=node.parentElement.closest('[data-column-fragment]');result[match[0]]=fragment?.getAttribute('data-column-fragment')||null}}return result});
  const region=key=>{assert.ok(regions[key],`${test.name}: missing ${key} ${JSON.stringify(regions)}`);return regions[key]};
  if(test.name==='heading'){assert.equal(region('HEAD00'),region('FOLLOW00'),JSON.stringify(regions));assert.equal(region('HEAD00'),region('FOLLOW01'),JSON.stringify(regions));assert.notEqual(region('HEAD00'),region('FILL00'));}
  if(test.name==='keep-lines'){assert.equal(region('KEEP00'),region('KEEP01'));assert.equal(region('KEEP01'),region('KEEP02'));assert.notEqual(region('KEEP00'),region('FILL00'));}
  if(test.name==='widow'){const counts={};for(let i=0;i<14;i++){const r=region(`WIDOW${String(i).padStart(2,'0')}`);counts[r]=(counts[r]||0)+1;}assert.ok(Object.keys(counts).length>=2,JSON.stringify(counts));assert.ok(Object.values(counts).every(n=>n>=2),JSON.stringify(counts));}
  if(test.name==='page-before'){const before=Number(region('BEFORE00').split(':')[0]),after=Number(region('AFTER00').split(':')[0]);assert.ok(after>before,JSON.stringify(regions));}
  if(test.name==='oversized'){assert.notEqual(region('LONG00'),region('LONG24'));assert.equal(Object.keys(regions).filter(k=>k.startsWith('LONG')).length,25);}
  console.log(`PASS ${test.name}: ${JSON.stringify(regions)}`);
 }
 assert.deepEqual(errors,[]);console.log('PASS production paragraph pagination constraints. Artifacts: '+dir);
 }finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
