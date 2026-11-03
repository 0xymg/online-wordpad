/** Real editor image placement, history, persistence, Word and PDF regression. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-images-'));
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
 try {
  const page = await browser.newPage({viewport:{width:1500,height:1050}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.BASE_URL||'http://localhost:3107';
  await page.goto(base+'/pad'); await page.locator('.ProseMirror').waitFor(); await page.waitForTimeout(1000);
  const src=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=180;const x=c.getContext('2d');x.fillStyle='#e38723';x.fillRect(0,0,240,180);x.fillStyle='#162c48';x.fillRect(20,20,200,140);return c.toDataURL();});
  const sample=path.join(dir,'images.html');
  await fs.writeFile(sample,`<p><img src="${src}" data-width="180px" data-aspect-ratio="1.333333333333" alt="Placement sample">ANCHOR TEXT ${'A paragraph of text flowing beside the image. '.repeat(8)}</p><p>FOLLOWING PARAGRAPH ${'More text continues around the anchored image. '.repeat(8)}</p><p>FINAL MARKER</p>`);
  async function open(file,text){await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);const replace=page.getByRole('button',{name:'Replace document',exact:true});await replace.waitFor();await replace.click();await page.waitForFunction(text=>document.querySelector('.ProseMirror')?.textContent.includes(text),text);await page.waitForTimeout(400);}
  async function dialog(){await page.locator('.pm-image-wrapper img').first().click();await page.getByRole('button',{name:'Image layout',exact:true}).click();const d=page.getByRole('dialog',{name:'Image layout',exact:true});await d.waitFor();return d;}
  async function facts(){return page.locator('.pm-image-wrapper').first().evaluate(el=>({wrap:el.dataset.wrap,float:getComputedStyle(el).float,display:getComputedStyle(el).display,width:el.getBoundingClientRect().width,gap:parseFloat(getComputedStyle(el).marginRight),height:el.getBoundingClientRect().height}));}
  async function output(format,name){await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();const event=page.waitForEvent('download');await page.getByRole('menuitem',{name:format,exact:true}).click();const file=path.join(dir,name);await(await event).saveAs(file);return file;}
  await open(sample,'FINAL MARKER');
  let d=await dialog(); await d.getByRole('combobox',{name:'Text wrapping',exact:true}).selectOption('wrapLeft');await d.getByRole('spinbutton',{name:'Width (cm)',exact:true}).fill('4.76');await d.getByRole('spinbutton',{name:'Distance from text (pt)',exact:true}).fill('12');await d.getByRole('button',{name:'Apply',exact:true}).click();
  let f=await facts();assert.equal(f.float,'left');assert.equal(f.gap,16);assert.ok(Math.abs(f.width-180)<1,JSON.stringify(f));assert.ok(Math.abs(f.height-f.width*.75)<1);
  const flow=await page.locator('.ProseMirror>p').first().evaluate(p=>{const img=p.querySelector('.pm-image-wrapper').getBoundingClientRect();const text=Array.from(p.childNodes).find(n=>n.nodeType===3);const range=document.createRange();range.setStart(text,0);range.setEnd(text,6);const r=range.getBoundingClientRect();return{image:img.toJSON(),text:r.toJSON()};});assert.ok(flow.text.x>=flow.image.right+15);assert.ok(flow.text.y<flow.image.bottom);
  await page.keyboard.press('Meta+z');assert.equal((await facts()).wrap,'topBottom');await page.keyboard.press('Meta+Shift+z');assert.equal((await facts()).wrap,'wrapLeft');
  d=await dialog();await d.getByRole('combobox',{name:'Text wrapping',exact:true}).selectOption('wrapRight');await d.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await facts()).wrap,'wrapLeft');
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(1100);await page.reload();await page.locator('.pm-image-wrapper').waitFor();assert.equal((await facts()).wrap,'wrapLeft');await page.screenshot({path:path.join(dir,'wrap-left.png')});
  // Resizing uses document pixels, even at 50% zoom.
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'50%',exact:true}).click();await page.waitForTimeout(300);
  await page.locator('.pm-image-wrapper img').first().click();const handle=await page.locator('.pm-image-handle-br').first().boundingBox();const before=(await facts()).width;
  await page.mouse.move(handle.x+3,handle.y+3);await page.mouse.down();await page.mouse.move(handle.x+23,handle.y+3,{steps:5});await page.mouse.up();assert.ok(Math.abs((await facts()).width-before-20)<1);
  await page.keyboard.press('Meta+z');await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'100%',exact:true}).click();await page.waitForTimeout(300);
  assert.ok(Math.abs((await facts()).width-180)<1,'Resize undo restores the original document width');
  // The floating toolbar and the dialog must remain inside a phone viewport.
  await page.setViewportSize({width:390,height:844});d=await dialog();const box=await d.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391);await d.screenshot({path:path.join(dir,'mobile-dialog.png')});await d.getByRole('button',{name:'Cancel',exact:true}).click();await page.setViewportSize({width:1500,height:1050});await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'100%',exact:true}).click();await page.waitForTimeout(300);
  const word=await output('Word (.docx)','wrapped.docx');const zip=await JSZip.loadAsync(await fs.readFile(word)),xml=await zip.file('word/document.xml').async('string');assert.match(xml,/<wp:anchor\b/);assert.match(xml,/<wp:wrapSquare[^>]*wrapText="right"/);assert.match(xml,/<wp:positionV relativeFrom="paragraph"/);assert.match(xml,/distR="152400"/);
  await open(word,'FINAL MARKER');f=await facts();assert.equal(f.wrap,'wrapLeft');assert.equal(f.gap,16);assert.ok(Math.abs(f.width-180)<1,JSON.stringify(f));
  for(const mode of ['wrapRight','inline','topBottom']){d=await dialog();await d.getByRole('combobox',{name:'Text wrapping',exact:true}).selectOption(mode);if(mode==='topBottom')await d.getByRole('combobox',{name:'Alignment',exact:true}).selectOption('center');await d.getByRole('button',{name:'Apply',exact:true}).click();f=await facts();assert.equal(f.wrap,mode);assert.equal(f.float,mode==='wrapRight'?'right':'none');if(mode==='inline')assert.equal(f.display,'inline-block');const file=await output('Word (.docx)',mode+'.docx');const z=await JSZip.loadAsync(await fs.readFile(file)),x=await z.file('word/document.xml').async('string');assert.match(x,mode==='inline'?/<wp:inline\b/:mode==='topBottom'?/<wp:wrapTopAndBottom\b/:/<wp:wrapSquare[^>]*wrapText="left"/);await open(file,'FINAL MARKER');assert.equal((await facts()).wrap,mode);}
  // Image anchored near a page boundary must move intact onto the next page.
  const near=path.join(dir,'near-boundary.html');await fs.writeFile(near,Array.from({length:28},(_,i)=>`<p>BEFORE ${i}</p>`).join('')+`<p><img src="${src}" data-width="210px" data-aspect-ratio="1.333333333333" data-wrap="wrapRight" data-distance="16">BOUNDARY ANCHOR</p><p>END BOUNDARY</p>`);await open(near,'END BOUNDARY');
  const geometry=await page.evaluate(()=>{const img=document.querySelector('.pm-image-wrapper').getBoundingClientRect(),root=document.querySelector('.pm-page').getBoundingClientRect();return{top:img.top-root.top,bottom:img.bottom-root.top,height:img.height,pages:document.querySelectorAll('.pm-page-spacer').length+1};});assert.ok(geometry.pages>=2);const sheet=1122.53+26;assert.ok(Math.floor(geometry.top/sheet)===Math.floor(geometry.bottom/sheet),JSON.stringify(geometry));
  // Preserve the exact print source for checking page-local image placement.
  page.on('frameattached',async frame=>{try{await frame.evaluate(()=>{window.print=()=>{window.top.__imagePrint=document.documentElement.outerHTML;};});}catch{}});
  await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:/^Print\b/}).click();await page.waitForFunction(()=>window.__imagePrint);
  const printHtml=await page.evaluate(()=>window.__imagePrint);await fs.writeFile(path.join(dir,'boundary-print.html'),printHtml);
  const printed=await browser.newPage();await printed.route('**/__image-print',r=>r.fulfill({contentType:'text/html',body:printHtml}));await printed.goto(base+'/__image-print',{waitUntil:'networkidle'});await printed.pdf({path:path.join(dir,'boundary-print.pdf'),preferCSSPageSize:true,printBackground:true});await printed.close();
  const pdf=await output('PDF (.pdf)','boundary.pdf');assert.ok((await fs.stat(pdf)).size>10000);await page.screenshot({path:path.join(dir,'boundary.png')});
  assert.deepEqual(errors,[]);console.log('PASS image wrapping geometry, dimensions, spacing, cancel, undo/redo, reload, native DOCX roundtrips, boundary pagination and PDF export. Artifacts: '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
