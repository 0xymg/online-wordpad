/** Real DOCX with portrait/landscape/Letter sections: preview and roundtrip. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const { Document, Packer, Paragraph, PageOrientation } = require('docx');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-sections-'));
 const pages=[{width:11906,height:16838,margin:{top:720,right:1080,bottom:1440,left:720}}, {width:16838,height:11906,margin:{top:1200,right:900,bottom:600,left:1800}}, {width:12240,height:15840,margin:{top:1440,right:1440,bottom:1440,left:1440}}];
 const source=path.join(dir,'sections.docx');
 await fs.writeFile(source,await Packer.toBuffer(new Document({sections:pages.map((p,index)=>({properties:{page:{size:{width:Math.min(p.width,p.height),height:Math.max(p.width,p.height),orientation:p.width>p.height?PageOrientation.LANDSCAPE:PageOrientation.PORTRAIT},margin:p.margin}},children:Array.from({length:35},(_,i)=>new Paragraph(`SECTION ${index+1} — paragraph ${i}. ${'Text for testing section page geometry. '.repeat(5)}`))}))})));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  const page=await browser.newPage({viewport:{width:1550,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad');
  await page.locator('.ProseMirror').waitFor();
  await page.waitForTimeout(1100);
  async function open(file) {
   await page.locator('.ProseMirror').fill('Import pending');
   await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
   const replace=page.getByRole('button',{name:'Replace document',exact:true});
   await Promise.race([replace.waitFor({state:'visible'}),page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('SECTION 1'))]);
   if(await replace.isVisible())await replace.click();
   await page.waitForFunction(()=>document.querySelectorAll('.pm-section-sheet').length>=3);
   await page.waitForTimeout(800);
  }
  await open(source);
  const geometry=await page.evaluate(()=>({
   sheets:Array.from(document.querySelectorAll('.pm-section-sheet')).map(e=>({section:+e.dataset.sectionIndex,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,top:parseFloat(e.style.top)})),
   blocks:[0,1,2].map(i=>{const e=document.querySelector(`.ProseMirror > [data-page-section="${i}"]`),r=e.getBoundingClientRect(),p=document.querySelector('.pm-page').getBoundingClientRect();return {width:r.width,left:r.left-p.left};}),
   paper:document.querySelector('.pm-page').getBoundingClientRect().height
  }));
  await fs.writeFile(path.join(dir,'geometry.json'),JSON.stringify(geometry,null,2));
  assert.deepEqual([...new Set(geometry.sheets.map(s=>s.section))],[0,1,2]);
  let top=0;
  for(const sheet of geometry.sheets) {
   const p=pages[sheet.section];
   assert.ok(Math.abs(sheet.width-p.width/15)<1);assert.ok(Math.abs(sheet.height-p.height/15)<1);assert.ok(Math.abs(sheet.top-top)<1);top+=p.height/15+26;
  }
  assert.ok(Math.abs(geometry.paper-(top-26))<4,`paper height ${geometry.paper} vs ${top-26}`);
  const maximum=Math.max(...pages.map(p=>p.width));
  geometry.blocks.forEach((b,i)=>{assert.ok(Math.abs(b.width-(pages[i].width-pages[i].margin.left-pages[i].margin.right)/15)<1);assert.ok(Math.abs(b.left-((maximum-pages[i].width)/2+pages[i].margin.left)/15)<1);});
  const landscape=geometry.sheets.find(s=>s.section===1);
  await page.locator('.editor-shell').evaluate((e,top)=>{e.scrollTop=top;},landscape.top);
  await page.screenshot({path:path.join(dir,'landscape.png')});
  await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();
  const event=page.waitForEvent('download');await page.getByRole('menuitem',{name:'Word (.docx)',exact:true}).click();
  const output=path.join(dir,'roundtrip.docx');await(await event).saveAs(output);
  const zip=await JSZip.loadAsync(await fs.readFile(output));
  const sizes=await page.evaluate(xml=>{const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',d=new DOMParser().parseFromString(xml,'application/xml');return Array.from(d.getElementsByTagNameNS(w,'sectPr')).map(s=>{const z=s.getElementsByTagNameNS(w,'pgSz')[0],m=s.getElementsByTagNameNS(w,'pgMar')[0];return {width:+z.getAttributeNS(w,'w'),height:+z.getAttributeNS(w,'h'),left:+m.getAttributeNS(w,'left')};});},await zip.file('word/document.xml').async('string'));
  assert.deepEqual(sizes,pages.map(p=>({width:p.width,height:p.height,left:p.margin.left})));
  await open(output);
  assert.deepEqual(errors,[]);
  console.log('PASS section geometry: portrait, landscape, Letter, asymmetric margins, automatic pages, visual widths, paper heights and DOCX roundtrip. Artifacts: '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
