/** Isolated real-pointer cross-page moves, history, and invalid drops. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const JSZip = require('jszip');
const { Document, Packer, Paragraph, ImageRun, PageOrientation } = require('docx');
(async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-cross-page-'));
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 try {
  const page = await browser.newPage({ viewport: { width: 1450, height: 1050 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
  await page.locator('.ProseMirror').waitFor(); await page.waitForTimeout(1100);
  const src = await page.evaluate(() => { const c = document.createElement('canvas'); c.width=160; c.height=120; c.getContext('2d').fillRect(0,0,160,120); return c.toDataURL(); });
  const file = path.join(dir, 'fixture.html');
  await fs.writeFile(file, `<p>FIXTURE FIRST <img src="${src}" alt="Cross page" data-width="160px" data-aspect-ratio="1.333333" data-position="page" data-x="120" data-y="180" data-layer="4"> ORIGINAL</p><hr data-page-break="true"><p>SECOND PAGE TEXT</p>`);
  await page.locator('.ProseMirror').fill('Import pending');
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
  await page.getByRole('button', {name:'Replace document',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent.includes('SECOND PAGE TEXT'));
  await page.waitForTimeout(600);
  const img = page.locator('.ProseMirror .pm-image-wrapper img');
  const state = () => img.evaluate(el => ({ parent: el.closest('p')?.textContent, x:Number(el.dataset.x), y:Number(el.dataset.y), layer:el.dataset.layer, text:el.closest('.ProseMirror').textContent, count:el.closest('.ProseMirror').querySelectorAll('.pm-image-wrapper').length }));
  async function dragTo(target, cancel=false) {
    await img.scrollIntoViewIfNeeded(); await img.evaluate(el => { const shell=el.closest(".editor-shell"); shell.scrollTop += el.getBoundingClientRect().top - 450; }); await page.waitForTimeout(200);
    const box=await img.boundingBox(), x=box.x+box.width*.4, y=box.y+box.height*.65;
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+8,y+8);
    await page.evaluate((which) => { const shell=document.querySelector('.editor-shell'); const p=[...document.querySelectorAll('.ProseMirror p')].find(p=>p.textContent.includes(which)); shell.scrollTop += p.getBoundingClientRect().top - 450; },target);
    await page.waitForTimeout(200);
    const para=page.locator('.ProseMirror p').filter({hasText:target}).first(); const rect=await para.boundingBox();
    await page.mouse.move(rect.x+100,rect.y+8,{steps:8});
    if(cancel) await page.keyboard.press('Escape');
    await page.mouse.up(); await page.waitForTimeout(500);
  }
  const original=await state(); await dragTo('SECOND'); let moved=await state();
  assert.match(moved.parent,/SECOND PAGE TEXT/); assert.equal(moved.count,1); assert.equal(moved.layer,'4'); assert.equal(moved.text,original.text);
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(400); assert.deepEqual(await state(),original);
  await page.keyboard.press('Meta+Shift+z'); await page.waitForTimeout(400); assert.match((await state()).parent,/SECOND PAGE TEXT/);
  await dragTo('FIRST'); assert.match((await state()).parent,/FIXTURE FIRST/);
  await dragTo('SECOND',true); assert.match((await state()).parent,/FIXTURE FIRST/);
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click(); await page.getByRole('option',{name:'50%',exact:true}).click(); await page.waitForTimeout(300); await page.locator('.ProseMirror p').filter({hasText:'FIXTURE FIRST'}).click({position:{x:5,y:5}});
  await dragTo('SECOND'); assert.match((await state()).parent,/SECOND PAGE TEXT/);
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(300); assert.match((await state()).parent,/FIXTURE FIRST/);
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click(); await page.getByRole('option',{name:'100%',exact:true}).click(); await page.waitForTimeout(300);
  await img.evaluate(el => { const s=el.closest('.editor-shell'); s.scrollTop=0; }); await page.waitForTimeout(200);
  { const r=await img.boundingBox(), shell=await page.locator('.editor-shell').boundingBox(); await page.mouse.move(r.x+60,r.y+80); await page.mouse.down(); await page.mouse.move(r.x+70,r.y+90); await page.mouse.move(r.x+70,shell.y+shell.height-5,{steps:5});
    const initial=await page.locator('.editor-shell').evaluate(el=>el.scrollTop); await page.waitForTimeout(800); const scrolled=await page.locator('.editor-shell').evaluate(el=>el.scrollTop); assert.ok(scrolled>initial+30,'edge dragging scrolls the shell'); await page.keyboard.press('Escape'); await page.mouse.up(); }
  assert.match((await state()).parent,/FIXTURE FIRST/);
  await img.scrollIntoViewIfNeeded(); const box=await img.boundingBox(); await page.mouse.move(box.x+60,box.y+80); await page.mouse.down(); await page.mouse.move(5,200,{steps:5}); await page.mouse.up(); await page.waitForTimeout(300); assert.match((await state()).parent,/FIXTURE FIRST/);
  // Flow height may have created a natural block boundary. Moving the image
  // must preserve that sheet and undo must restore the original flow.
  await fs.writeFile(file, `<p>FIXTURE FIRST <img src="${src}" alt="Cross page" data-width="400px" data-aspect-ratio="1.333333"> FIRST TEXT</p>` + Array.from({length:32},(_,i)=>`<p>${i===31?'SECOND PAGE TEXT':`FILLER ${i}`}</p>`).join(''));
  await page.locator('.ProseMirror').fill('Import pending'); await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file); await page.getByRole('button',{name:'Replace document',exact:true}).click(); await page.waitForTimeout(600);
  const flowBefore=await state(); await dragTo('SECOND'); const flowAfter=await state(); assert.match(flowAfter.parent,/SECOND PAGE TEXT/); assert.equal(flowAfter.text,flowBefore.text); assert.equal(flowAfter.count,1);
  assert.ok(await img.evaluate(el=>{const root=el.closest('.ProseMirror'),host=el.closest('.pm-page'),scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width);return (el.getBoundingClientRect().top-host.getBoundingClientRect().top)/scale>1120;}), 'natural destination remains on page two');
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(400); assert.match((await state()).parent,/FIXTURE FIRST/);
  // Real mixed-section DOCX: portrait A4 -> landscape A4 with asymmetric margins.
  const source=path.join(dir,'mixed.docx');
  await fs.writeFile(source,await Packer.toBuffer(new Document({sections:[
   {properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.PORTRAIT},margin:{top:720,right:1080,bottom:1440,left:720}}},children:[new Paragraph({children:[new ImageRun({data:Buffer.from(src.split(',')[1],'base64'),type:'png',transformation:{width:160,height:120}})]}),new Paragraph('FIXTURE FIRST MIXED')]},
   {properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.LANDSCAPE},margin:{top:1200,right:900,bottom:600,left:1800}}},children:[new Paragraph('SECOND PAGE TEXT MIXED')]}
  ]})));
  await page.locator('.ProseMirror').fill('Import pending'); await page.locator('input[type=file][accept*=".docx"]').setInputFiles(source); await page.getByRole('button',{name:'Replace document',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.pm-section-sheet').length>=2); await page.waitForTimeout(700);
  const sheets=await page.locator('.pm-section-sheet').evaluateAll(els=>els.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  assert.ok(sheets[0].height>sheets[0].width && sheets[1].width>sheets[1].height,'fixture has portrait and landscape sheets');
  // First fix the inline artwork on its original page, then move it.
  await img.scrollIntoViewIfNeeded(); await img.evaluate(el=>{const shell=el.closest('.editor-shell');shell.scrollTop+=el.getBoundingClientRect().top-450;}); await page.waitForTimeout(200);
  {const r=await img.boundingBox();await page.mouse.move(r.x+r.width*.4,r.y+r.height*.7);await page.mouse.down();await page.mouse.move(r.x+r.width*.4+20,r.y+r.height*.7+20,{steps:5});await page.mouse.up();await page.waitForTimeout(400);}
  assert.equal(await img.getAttribute('data-position'),'page');
  await dragTo('SECOND'); const mixed=await state(); assert.match(mixed.parent,/SECOND PAGE TEXT MIXED/); assert.equal(mixed.count,1);
  const actual=await img.evaluate(el=>{const root=el.closest('.ProseMirror'),sheet=document.querySelectorAll('.pm-section-sheet')[1],scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width),r=el.getBoundingClientRect(),p=sheet.getBoundingClientRect();return {x:(r.left-p.left)/scale,y:(r.top-p.top)/scale};});
  assert.ok(Math.abs(actual.x-mixed.x)<2 && Math.abs(actual.y-mixed.y)<2,JSON.stringify({actual,mixed}));
  await page.getByRole('menuitem',{name:'File',exact:true}).click(); await page.getByRole('menuitem',{name:'Export',exact:true}).hover(); const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('menuitem',{name:'Word (.docx)',exact:true}).click({timeout:10000})]); const word=path.join(dir,'moved.docx'); await download.saveAs(word);
  const zip=await JSZip.loadAsync(await fs.readFile(word)), xml=await zip.file('word/document.xml').async('string');
  const native=await page.evaluate(xml=>{const d=new DOMParser().parseFromString(xml,'application/xml'), w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',a=d.getElementsByTagNameNS(wp,'anchor')[0],p=a?.closest('p');return {count:d.getElementsByTagNameNS(wp,'anchor').length,text:p?.textContent,relative:[...a.getElementsByTagNameNS(wp,'positionH'),...a.getElementsByTagNameNS(wp,'positionV')].map(n=>n.getAttribute('relativeFrom')),offsets:[...a.getElementsByTagNameNS(wp,'posOffset')].map(n=>Number(n.textContent))};},xml);
  assert.equal(native.count,1); assert.match(native.text,/SECOND PAGE TEXT MIXED/); assert.deepEqual(native.relative,['page','page']); assert.ok(Math.abs(native.offsets[0]/9525-mixed.x)<1 && Math.abs(native.offsets[1]/9525-mixed.y)<1,JSON.stringify({native,mixed}));
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(word); await page.getByRole('button',{name:'Replace document',exact:true}).click(); await page.waitForTimeout(800);
  const roundtrip=await state(); assert.match(roundtrip.parent,/SECOND PAGE TEXT MIXED/); assert.equal(roundtrip.count,1); assert.ok(Math.abs(roundtrip.x-mixed.x)<1 && Math.abs(roundtrip.y-mixed.y)<1,JSON.stringify({mixed,roundtrip}));
  assert.deepEqual(errors, []); console.log('PASS cross-page forward/back, zoom, autoscroll, natural boundary, mixed sections and native Word anchor roundtrip. Artifacts: '+dir);
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
