/* eslint-disable @typescript-eslint/no-require-imports */
/** Real cross-page drag chooses the target column, with one canonical image. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-column-images-'));
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  const page = await browser.newPage({viewport:{width:1450,height:1100}}), errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__columnReady=0;document.addEventListener('edtr-column-flow-ready',event=>{if(event.target?.getAttribute('contenteditable')==='true')window.__columnReady++})});
  await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad');
  const editor=page.locator('.ProseMirror[contenteditable=true]');await editor.waitFor();
  await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({state:'hidden'});
  const src=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=80;c.getContext('2d').fillRect(0,0,100,80);return c.toDataURL()});
  const layout={width:12240,height:15840,margins:{top:1440,right:1440,bottom:1440,left:1440},section:'<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:cols w:num="3" w:space="720"/></w:sectPr>'};
  const html=`<div data-edtr-layout="${JSON.stringify(layout).replaceAll('&','&amp;').replaceAll('"','&quot;')}"><p>SOURCE_MARK <img src="${src}" alt="Column drag" data-width="100px" data-aspect-ratio="1.25" data-position="page" data-x="120" data-y="160" data-layer="4"></p><hr data-page-break="true"><p>TARGET_LEFT<br data-edtr-column-break="true">TARGET_MIDDLE<br data-edtr-column-break="true">TARGET_RIGHT</p></div>`;
  const fixture=path.join(dir,'images.html');await fs.writeFile(fixture,html);
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(fixture);
  await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('TARGET_RIGHT'));
  await page.waitForFunction(()=>document.querySelector('[data-column-fragment="1:2"]')||document.querySelector('[data-column-flow-error]'));
  await page.waitForFunction(()=>window.__columnReady>0||document.querySelector('[data-column-flow-error]'));
  assert.equal(await editor.getAttribute('data-column-flow-error'),null);
  const img=editor.locator('img[alt="Column drag"]');
  const imageState=()=>img.evaluate(img=>{const p=img.closest('p'),range=document.createRange();range.setStart(p,0);range.setEndBefore(img.closest('.pm-image-wrapper'));return{prefix:range.toString(),breaks:range.cloneContents().querySelectorAll('br[data-edtr-column-break]').length,paragraph:p.textContent,count:img.closest('.ProseMirror').querySelectorAll('img[alt="Column drag"]').length,x:Number(img.dataset.x),y:Number(img.dataset.y)}});
  async function drag(marker, expected='move') {
   const generation=await page.evaluate(()=>window.__columnReady);
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>{const img=document.querySelector('img[alt="Column drag"]'),host=img?.closest('.pm-page'),root=img?.closest('.ProseMirror');if(!img||!host||!root)return false;if(img.dataset.position!=='page')return img.complete;const scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width);return Math.abs(img.getBoundingClientRect().top-host.getBoundingClientRect().top-Number(img.dataset.y)*scale)<1;});
   await img.scrollIntoViewIfNeeded();await img.evaluate(img=>{const shell=img.closest('.editor-shell');shell.scrollTop+=img.getBoundingClientRect().top-450});await page.waitForTimeout(200);
   const r=await img.boundingBox(),grab=await img.evaluate(el=>{const r=el.getBoundingClientRect(),candidates=[];for(const yf of [.2,.4,.6,.8])for(const xf of [.2,.4,.6,.8]){const x=r.left+r.width*xf,y=r.top+r.height*yf,hit=document.elementFromPoint(x,y);candidates.push({x,y,hit:hit?.outerHTML.slice(0,150),valid:hit===el})}return candidates});const start=grab.find(point=>point.valid);assert.ok(start,JSON.stringify({message:'No unobstructed image drag point',grab}));await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+10,start.y+10);const started=await page.locator('.pm-image-drag-preview').count();assert.equal(started,1,JSON.stringify({start,grab}));
   const point=await editor.evaluate((el,marker)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){const at=n.data.indexOf(marker);if(at<0)continue;const range=document.createRange();range.setStart(n,at+2);range.setEnd(n,at+3);let rect=range.getBoundingClientRect();el.closest('.editor-shell').scrollTop+=rect.top-450;rect=range.getBoundingClientRect();return{x:rect.left,y:(rect.top+rect.bottom)/2}}throw Error('Missing target '+marker)},marker);
   await page.mouse.move(point.x,point.y,{steps:8});const preview=await page.locator('.pm-image-drag-preview').evaluate(el=>({opacity:getComputedStyle(el).opacity,outline:getComputedStyle(el).outlineStyle}));await page.mouse.up();
   if(expected==='reject'){await page.waitForTimeout(700);assert.equal(preview.opacity,'0.4',JSON.stringify(preview));assert.equal(preview.outline,'solid',JSON.stringify(preview));assert.equal(await page.evaluate(()=>window.__columnReady),generation,'rejected drag must not cause a document reflow');return;}
   await page.waitForFunction(before=>window.__columnReady>before||document.querySelector('[data-column-flow-error]'),generation).catch(async error=>{
    await page.screenshot({path:path.join(dir,'drag-timeout.png')});
    console.error('Drag timeout', {marker,start:r,grab,started,target:point,state:await imageState(),generation,ready:await page.evaluate(()=>window.__columnReady),dir});
    throw error;
   });assert.equal(await editor.getAttribute('data-column-flow-error'),null);
  }
  const before=await imageState();
  for(const [marker,column] of [['TARGET_MIDDLE',1],['TARGET_RIGHT',2]]) {
   await drag(marker);const moved=await imageState();if(moved.breaks!==column){await page.screenshot({path:path.join(dir,'drag-failure.png')});console.error('Column image failure artifacts: '+dir);}assert.equal(moved.count,1);assert.equal(moved.breaks,column,JSON.stringify(moved));assert.equal(await editor.getAttribute('data-column-flow-error'),null);
   const actual=await img.evaluate(img=>{const root=img.closest('.ProseMirror'),sheet=img.closest('.pm-page').querySelectorAll('.pm-section-sheet')[1],r=img.getBoundingClientRect(),p=sheet.getBoundingClientRect(),scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width);return{x:(r.left-p.left)/scale,y:(r.top-p.top)/scale}});assert.ok(Math.abs(actual.x-moved.x)<1&&Math.abs(actual.y-moved.y)<1,JSON.stringify({actual,moved}));
   const undoGeneration=await page.evaluate(()=>window.__columnReady);
   await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');
   await page.waitForFunction(previous=>window.__columnReady>previous,undoGeneration);
   assert.deepEqual(await imageState(),before);
  }
  const flowing=path.join(dir,'flow-images.html');await fs.writeFile(flowing,html.replace('data-position="page"','data-position="flow"'));
  const importGeneration=await page.evaluate(()=>window.__columnReady);
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(flowing);await page.getByRole('button',{name:'Replace document',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('img[alt="Column drag"]')?.getAttribute('data-position')!=='page');
  await page.waitForFunction(previous=>window.__columnReady>previous||document.querySelector('[data-column-flow-error]'),importGeneration);
  await page.waitForFunction(()=>document.querySelector('[data-column-fragment="1:2"]')||document.querySelector('[data-column-flow-error]'));assert.equal(await editor.getAttribute('data-column-flow-error'),null);
  const flowBefore=await imageState(),canonicalBefore=await editor.textContent();assert.equal(await editor.locator('hr[data-page-break]').count(),1);assert.equal(await editor.locator('br[data-edtr-column-break]').count(),2);
  await drag('TARGET_MIDDLE');assert.equal((await imageState()).breaks,1,'flow image moves to next physical page and middle column');assert.equal(await img.getAttribute('data-position'),'page');assert.equal(await editor.locator('hr[data-page-break]').count(),1,'explicit page boundary remains');assert.equal(await editor.locator('br[data-edtr-column-break]').count(),2,'explicit column boundaries remain');assert.equal(await editor.textContent(),canonicalBefore);
  const flowUndo=await page.evaluate(()=>window.__columnReady);await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await page.waitForFunction(previous=>window.__columnReady>previous,flowUndo);assert.deepEqual(await imageState(),flowBefore);assert.equal(await img.getAttribute('data-position'),'flow');assert.equal(await editor.locator('hr[data-page-break]').count(),1);assert.equal(await editor.locator('br[data-edtr-column-break]').count(),2);
  const unsafe=path.join(dir,'unsafe-flow.html'),long=Array.from({length:1500},(_,i)=>`unsafe${String(i).padStart(4,'0')}`).join(' '),unsafeHtml=`<div data-edtr-layout="${JSON.stringify(layout).replaceAll('&','&amp;').replaceAll('"','&quot;')}"><p>UNSAFE_SOURCE <img src="${src}" alt="Column drag" data-width="100px" data-aspect-ratio="1.25" data-position="flow"> ${long} UNSAFE_END</p></div>`;await fs.writeFile(unsafe,unsafeHtml);
  const unsafeGeneration=await page.evaluate(()=>window.__columnReady);await page.locator('input[type=file][accept*=".docx"]').setInputFiles(unsafe);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror[contenteditable=true]')?.textContent.includes('UNSAFE_END'));await page.waitForFunction(n=>window.__columnReady>n&&document.querySelector('.ProseMirror[contenteditable=true] [data-column-fragment^="1:"]')||document.querySelector('[data-column-flow-error]'),unsafeGeneration,{timeout:30000});assert.equal(await editor.getAttribute('data-column-flow-error'),null);
  await page.getByRole('menuitem',{name:'Insert',exact:true}).click();await page.getByRole('menuitem',{name:'Section layout…',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Section layout'});await dialog.evaluate(el=>{let fiber=el[Object.keys(el).find(key=>key.startsWith('__reactFiber$'))];while(fiber&&!(fiber.memoizedProps?.view?.state?.doc&&fiber.memoizedProps.view.dom))fiber=fiber.return;if(!fiber)throw Error('Editor view not found');window.__imageTestView=fiber.memoizedProps.view});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  const unsafeBefore=await imageState(),unsafeText=await editor.textContent(),unsafeModel=await page.evaluate(()=>JSON.stringify(window.__imageTestView.state.doc.toJSON()));const unsafeTarget=await editor.evaluate(el=>{const fragment=el.querySelector('[data-column-fragment^="1:"]'),walker=document.createTreeWalker(fragment,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){const match=n.data.match(/unsafe\d{4}/);if(match)return match[0]}throw Error('No text in destination page')});await drag(unsafeTarget,'reject');assert.deepEqual(await imageState(),unsafeBefore);assert.equal(await img.getAttribute('data-position'),'flow');assert.equal(await editor.textContent(),unsafeText);assert.equal(await page.evaluate(()=>JSON.stringify(window.__imageTestView.state.doc.toJSON())),unsafeModel,'rejected drag must not change any canonical model data');assert.equal(await editor.locator('hr[data-page-break]').count(),0,'rejected drag adds no page break');
  await page.screenshot({path:path.join(dir,'image-columns.png')});assert.deepEqual(errors,[]);
  console.log('PASS fixed/flow image cross-page drag, boundaries and undo; unsafe midparagraph boundary rejects unchanged. Artifacts: '+dir);
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
