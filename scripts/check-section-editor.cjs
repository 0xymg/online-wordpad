/** Isolated section pagination and native DOCX preservation regression. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const JSZip=require('jszip');
const { PDFDocument }=require('pdf-lib');
const {Document,Packer,Paragraph,Header,SectionType,PageOrientation,NumberFormat}=require('docx');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-section-editor-'));
 const source=path.join(dir,'sections.docx');
 const portrait={size:{width:12240,height:15840,orientation:PageOrientation.PORTRAIT},margin:{top:1440,right:1440,bottom:1440,left:1440}};
 const landscape={size:{width:11906,height:16838,orientation:PageOrientation.LANDSCAPE},margin:{top:900,right:1080,bottom:1200,left:1800},pageNumbers:{start:7,formatType:NumberFormat.UPPER_ROMAN}};
 await fs.writeFile(source,await Packer.toBuffer(new Document({sections:[
  {properties:{page:portrait},headers:{default:new Header({children:[new Paragraph('FIRST HEADER')]})},children:[new Paragraph('SECTION_ONE original text.')]},
  {properties:{type:SectionType.CONTINUOUS,page:portrait},children:[new Paragraph('SECTION_TWO continuous text.')]},
  {properties:{type:SectionType.NEXT_PAGE,page:landscape},headers:{default:new Header({children:[new Paragraph('THIRD HEADER')]})},children:[new Paragraph('SECTION_THREE landscape text.')]}
 ]})));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1550,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(20000);
  await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad'); await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1000);
  async function open(file){await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('SECTION_THREE'));await page.waitForTimeout(600);}
  const inspect=()=>page.evaluate(()=>({text:document.querySelector('.ProseMirror').textContent,sheets:[...document.querySelectorAll('.pm-section-sheet')].map(e=>({section:+e.dataset.sectionIndex,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),blocks:['SECTION_ONE','SECTION_TWO','SECTION_THREE'].map(s=>{const e=[...document.querySelectorAll('.ProseMirror p')].find(p=>p.textContent.includes(s));return {section:e?.dataset.pageSection,top:e?.getBoundingClientRect().top};})}));
  await open(source);let before=await inspect(); assert.equal(before.sheets.length,2,'continuous section shares the first sheet; next-page section opens second'); assert.equal(before.sheets[0].section,0);assert.equal(before.sheets[1].section,2);assert.ok(before.sheets[1].width>before.sheets[1].height);assert.deepEqual(before.blocks.map(b=>b.section),['0','1','2']);
  await page.getByRole('menuitem',{name:'File',exact:true}).click(); await page.getByRole('menuitem',{name:'Export',exact:true}).hover(); const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('menuitem',{name:'Word (.docx)',exact:true}).click()]);const exported=path.join(dir,'roundtrip.docx');await download.saveAs(exported);
  const zip=await JSZip.loadAsync(await fs.readFile(exported));const xml=await zip.file('word/document.xml').async('string');
  const sections=await page.evaluate(xml=>{const d=new DOMParser().parseFromString(xml,'application/xml'),w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';return [...d.getElementsByTagNameNS(w,'sectPr')].map(s=>{const child=n=>[...s.children].find(e=>e.localName===n),attr=(e,n)=>e?.getAttributeNS(w,n)||null,sz=child('pgSz'),mar=child('pgMar');return{type:attr(child('type'),'val')||'nextPage',width:+attr(sz,'w'),height:+attr(sz,'h'),margins:['top','right','bottom','left'].map(x=>+attr(mar,x)),headers:[...s.children].filter(e=>e.localName==='headerReference').length,numberStart:attr(child('pgNumType'),'start'),numberFormat:attr(child('pgNumType'),'fmt')};});},xml);
  assert.deepEqual(sections.map(s=>s.type),['nextPage','continuous','nextPage']);assert.deepEqual(sections.map(s=>[s.width,s.height]),[[12240,15840],[12240,15840],[16838,11906]]);assert.deepEqual(sections[2].margins,[900,1080,1200,1800]);assert.deepEqual(sections.map(s=>s.headers),[1,0,1]);assert.equal(sections[2].numberStart,'7');assert.equal(sections[2].numberFormat,'upperRoman');
  await open(exported);const after=await inspect();assert.equal(after.sheets.length,2);for(const token of ['SECTION_ONE','SECTION_TWO','SECTION_THREE'])assert.equal(after.text.split(token).length-1,1);
  await page.getByRole('menuitem',{name:'File',exact:true}).click(); await page.getByRole('menuitem',{name:'Export',exact:true}).hover(); const [pdfDownload]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('menuitem',{name:'PDF (.pdf)',exact:true}).click()]);const pdfPath=path.join(dir,'sections.pdf');await pdfDownload.saveAs(pdfPath);
  const pdf=await PDFDocument.load(await fs.readFile(pdfPath)),boxes=pdf.getPages().map(p=>p.getSize());assert.equal(boxes.length,2);assert.ok(Math.abs(boxes[0].width-612)<1&&Math.abs(boxes[0].height-792)<1,JSON.stringify(boxes));assert.ok(Math.abs(boxes[1].width-16838/20)<1&&Math.abs(boxes[1].height-11906/20)<1,JSON.stringify(boxes));assert.deepEqual(errors,[]);
  // A native Word Online reference confirms horizontal margin changes at a
  // continuous boundary remain on the same physical sheet.
  const marginFixture=path.join(__dirname,'../fixtures/section-editor/continuous-margins.docx');
  await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(marginFixture);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('PROBE_AFTER_34'));await page.waitForTimeout(600);
  const continuous=await page.evaluate(()=>{const ps=[...document.querySelectorAll('.ProseMirror p')],first=ps.find(e=>e.textContent.includes('PROBE_BEFORE')),next=ps.find(e=>e.textContent.includes('PROBE_AFTER_00')),sheet=document.querySelector('.pm-section-sheet'),root=document.querySelector('.ProseMirror'),scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width);return{first:first.getBoundingClientRect().toJSON(),next:next.getBoundingClientRect().toJSON(),page:sheet.getBoundingClientRect().toJSON(),scale,count:document.querySelectorAll('.pm-section-sheet').length};});
  assert.equal(continuous.count,2);assert.ok(continuous.next.top<continuous.page.bottom,'continuous changed horizontal margins stays on first page');assert.ok(Math.abs((continuous.next.left-continuous.first.left)/continuous.scale-48)<1,JSON.stringify(continuous));
  const verticalFixture=path.join(__dirname,'../fixtures/section-editor/continuous-vertical-margins.docx');
  await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(verticalFixture);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('PROBE_AFTER_34'));await page.waitForTimeout(600);
  const vertical=await page.evaluate(()=>{const ps=[...document.querySelectorAll('.ProseMirror p')],a=ps.find(e=>e.textContent.includes('PROBE_BEFORE')),b=ps.find(e=>e.textContent.includes('PROBE_AFTER_00')),sheet=document.querySelector('.pm-section-sheet'),spacer=document.querySelector('.pm-page-spacer');return{first:a.getBoundingClientRect().top,next:b.getBoundingClientRect().top,bottom:sheet.getBoundingClientRect().bottom,count:document.querySelectorAll('.pm-section-sheet').length,closing:parseFloat(spacer.children[1].style.height),opening:parseFloat(spacer.children[3].style.height)};});
  assert.equal(vertical.count,2);assert.ok(vertical.first<vertical.bottom&&vertical.next<vertical.bottom,'continuous vertical margin change shares first physical page');assert.ok(Math.abs(vertical.closing-96)<1 && Math.abs(vertical.opening-144)<1,JSON.stringify(vertical));
  console.log('PASS continuous and next-page sections, mixed page sizes/margins, linked/independent headers, Word-verified continuous margins, DOCX reimport and PDF geometry. Artifacts: '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
