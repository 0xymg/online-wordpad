/** Page-fixed images: visible geometry, layers, history, persistence and export. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-page-images-'));
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
 try {
  const page = await browser.newPage({viewport:{width:1450,height:1050}}), errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())}); page.setDefaultTimeout(15000);
  const base=process.env.BASE_URL||'http://localhost:3107';
  await page.goto(base+'/pad');await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1100);
  const sources=await page.evaluate(()=>['#e38723','#162c48'].map(color=>{const c=document.createElement('canvas');c.width=160;c.height=120;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,160,120);return c.toDataURL();}));
  async function load(html){const file=path.join(dir,'fixture.html');await fs.writeFile(file,html);await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('FIXTURE'));await page.waitForTimeout(500);}
  async function dialog(alt='Orange'){await page.locator(`.pm-image-wrapper img[alt="${alt}"]`).click({position:{x:8,y:8}});await page.getByRole('button',{name:'Image layout',exact:true}).click();return page.getByRole('dialog',{name:'Image layout',exact:true});}
  async function geometry(alt='Orange'){return page.locator(`.pm-image-wrapper img[alt="${alt}"]`).evaluate(img=>{const p=img.closest('.pm-page'),root=img.closest('.ProseMirror'),scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width),r=img.getBoundingClientRect(),pr=p.getBoundingClientRect();return{x:(r.left-pr.left)/scale,y:(r.top-pr.top)/scale,width:r.width/scale,height:r.height/scale,position:img.dataset.position,layer:img.dataset.layer};});}
  const image=(i,alt,extra='')=>`<img src="${sources[i]}" alt="${alt}" data-width="160px" data-aspect-ratio="1.33333333333" ${extra}>`;
  await load(`<p>FIXTURE START</p><p>${image(0,'Orange')}ANCHOR</p><p>FOLLOWING TEXT</p>`);
  let d=await dialog();await d.getByRole('combobox',{name:'Position',exact:true}).selectOption('page');await d.getByRole('spinbutton',{name:'From left edge (cm)',exact:true}).fill('2.54');await d.getByRole('spinbutton',{name:'From top edge (cm)',exact:true}).fill('5.08');await d.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForTimeout(300);
  let g=await geometry();assert.equal(g.position,'page');assert.ok(Math.abs(g.x-96)<1&&Math.abs(g.y-192)<1,JSON.stringify(g));
  // Editing before its paragraph does not change page-relative coordinates.
  await page.locator('.ProseMirror>p').first().click();await page.keyboard.press('Home');await page.keyboard.press('Enter');await page.keyboard.type('Inserted before anchor');await page.waitForTimeout(300);g=await geometry();assert.ok(Math.abs(g.y-192)<1,JSON.stringify(g));
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'50%',exact:true}).click();await page.waitForTimeout(250);g=await geometry();assert.ok(Math.abs(g.x-96)<1&&Math.abs(g.y-192)<1);await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'100%',exact:true}).click();
  await page.locator('.pm-image-wrapper img').click();const menu=page.getByRole('dialog').filter({has:page.getByRole('button',{name:'Image layout',exact:true})});await menu.getByRole('button',{name:'Align center',exact:true}).click();await page.waitForTimeout(300);g=await geometry();assert.ok(Math.abs(g.x-(11906/15-g.width)/2)<1,JSON.stringify(g));assert.equal(await page.getByRole('button',{name:'Center',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await menu.getByRole('button',{name:'Align center',exact:true}).getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(1100);await page.reload();await page.locator('.pm-image-wrapper img').waitFor();assert.equal((await geometry()).position,'page');
  // Explicit second sheet and two overlapping page images. Stacking is visible.
  await load(`<p>FIXTURE PAGE ONE</p><hr data-page-break="true"><p>PAGE TWO ${image(0,'Orange','data-position="page" data-x="100" data-y="160" data-layer="0"')}</p><p>${image(1,'Navy','data-position="page" data-x="180" data-y="200" data-layer="1"')}SECOND ANCHOR</p>`);
  await page.waitForTimeout(400);g=await geometry();assert.ok(g.y>1122,'image must be on second page '+JSON.stringify(g));assert.ok(Math.abs(g.y-(16838/15+26+160))<2,JSON.stringify(g));
  async function topImage(){return page.evaluate(()=>{const img=document.querySelector('img[alt="Navy"]'),r=img.getBoundingClientRect();return document.elementsFromPoint(r.left+15,r.top+15).find(e=>e.tagName==='IMG')?.getAttribute('alt');});}
  await page.locator('img[alt="Navy"]').scrollIntoViewIfNeeded();assert.equal(await topImage(),'Navy');
  d=await dialog();await d.getByRole('button',{name:'Bring to front',exact:true}).click();await d.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForTimeout(250);assert.equal(await topImage(),'Orange');
  await page.keyboard.press('Meta+z');await page.waitForTimeout(250);assert.equal(await topImage(),'Navy');await page.keyboard.press('Meta+Shift+z');await page.waitForTimeout(250);assert.equal(await topImage(),'Orange');
  d=await dialog();await d.getByRole('button',{name:'Send to back',exact:true}).click();await d.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForTimeout(250);assert.equal(await topImage(),'Navy');await page.keyboard.press('Meta+z');await page.waitForTimeout(250);assert.equal(await topImage(),'Orange');
  await page.screenshot({path:path.join(dir,'layers.png')});
  async function output(format,name){await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();const event=page.waitForEvent('download',{timeout:60000});await page.getByRole('menuitem',{name:format,exact:true}).click();const file=path.join(dir,name);await(await event).saveAs(file);return file;}
  const word=await output('Word (.docx)','fixed.docx'),zip=await JSZip.loadAsync(await fs.readFile(word)),xml=await zip.file('word/document.xml').async('string');assert.equal((xml.match(/<wp:wrapNone\b/g)||[]).length,2);assert.equal((xml.match(/relativeFrom="page"/g)||[]).length,4);assert.match(xml,/<wp:posOffset>952500<\/wp:posOffset>/);assert.match(xml,/allowOverlap="1"/);
  // The print clone must omit ProseMirror's source-less editor separator images.
  await page.evaluate(()=>{window.__pdfSeparatorCount=null;const observer=new MutationObserver(()=>{const sheets=document.querySelectorAll('.edtr-print-sheet');if(!sheets.length)return;window.__pdfSeparatorCount=document.querySelectorAll('.edtr-print-sheet .ProseMirror-separator').length;observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});});
  const pdf=await output('PDF (.pdf)','fixed.pdf').catch(async e=>{console.log('BODY',await page.locator('body').innerText());throw e;});assert.ok((await fs.stat(pdf)).size>10000);assert.equal(await page.evaluate(()=>window.__pdfSeparatorCount),0,'PDF artwork excludes editor separator images');
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(word);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForTimeout(700);const fixed=await page.locator('.pm-image-wrapper img').evaluateAll(images=>images.map(i=>({position:i.dataset.position,x:Number(i.dataset.x),y:Number(i.dataset.y),layer:Number(i.dataset.layer)})));assert.equal(fixed.length,2);assert.ok(fixed.every(i=>i.position==='page'));assert.ok(Math.abs(fixed[0].x-100)<1&&Math.abs(fixed[0].y-160)<1);assert.ok(fixed[0].layer>fixed[1].layer);
  assert.deepEqual(errors,[]);console.log('PASS page-fixed X/Y, typing, zoom, synchronized alignment, reload, page two, visible layers, undo/redo, native DOCX roundtrip and PDF. Artifacts: '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
