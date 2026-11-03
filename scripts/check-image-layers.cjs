/** Layer panel: obscured image access, shared order commands, live selection and document changes. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-image-layers-'));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad');await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1100);
  const sources=await page.evaluate(()=>['#e38723','#162c48'].map(color=>{const c=document.createElement('canvas');c.width=160;c.height=120;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,160,120);return c.toDataURL();}));
  async function load(html){const file=path.join(dir,'fixture.html');await fs.writeFile(file,html);await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('FIXTURE'));await page.waitForTimeout(400);}
  const img=(index,alt,extra='')=>`<img src="${sources[index]}" alt="${alt}" data-width="160px" data-aspect-ratio="1.3333333333" ${extra}>`;
  await load(`<p>FIXTURE LAYERS</p><p>${img(0,'Orange','data-position="page" data-x="120" data-y="200" data-layer="0"')}</p><p>${img(1,'Navy','data-position="page" data-x="120" data-y="200" data-layer="1"')}</p><p>${img(0,'Flow')}FLOW ANCHOR</p>`);
  await page.getByRole('menuitem',{name:'View',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Layers',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'Layers',exact:true});await panel.waitFor();
  const row=name=>panel.getByRole('button',{name,exact:true});
  const selected=()=>page.locator('.ProseMirror .pm-image-wrapper.is-selected img').getAttribute('alt');
  const front=panel.getByRole('button',{name:'Bring to front',exact:true}),back=panel.getByRole('button',{name:'Send to back',exact:true});
  async function topImage(){return page.locator('.ProseMirror img[alt="Navy"]').evaluate(img=>{const r=img.getBoundingClientRect();return document.elementsFromPoint(r.left+r.width*.5,r.top+r.height*.8).find(el=>el.matches('.ProseMirror img'))?.getAttribute('alt');});}
  await row('Orange').click();assert.equal(await selected(),'Orange');assert.equal(await row('Orange').getAttribute('aria-pressed'),'true');assert.equal(await topImage(),'Navy','Orange is initially entirely obscured');
  await front.click();await page.waitForTimeout(200);assert.equal(await topImage(),'Orange');await page.keyboard.press('Meta+z');await page.waitForTimeout(200);assert.equal(await topImage(),'Navy');await page.keyboard.press('Meta+Shift+z');await page.waitForTimeout(200);assert.equal(await topImage(),'Orange');
  await back.click();await page.waitForTimeout(200);assert.equal(await topImage(),'Navy');
  const lightBackground=await panel.evaluate(el=>getComputedStyle(el).backgroundColor);await page.getByRole('button',{name:'Toggle dark mode',exact:true}).click();await page.waitForTimeout(150);assert.notEqual(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),lightBackground);await page.screenshot({path:path.join(dir,'desktop-dark-panel.png')});await page.getByRole('button',{name:'Toggle dark mode',exact:true}).click();
  await row('Navy').click();assert.equal(await selected(),'Navy');await page.keyboard.press('Delete');assert.equal(await row('Navy').count(),0);await page.keyboard.press('Meta+z');await row('Navy').waitFor();
  await row('Flow').focus();await page.keyboard.press('Enter');assert.equal(await selected(),'Flow');assert.equal(await front.isDisabled(),true);assert.equal(await back.isDisabled(),true);
  await page.locator('.ProseMirror>p').first().click();await page.waitForTimeout(100);assert.equal(await panel.locator('button[aria-pressed="true"]').count(),0);
  await row('Orange').click();await page.getByRole('button',{name:'Image layout',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Image layout',exact:true});await dialog.getByRole('button',{name:'Bring to front',exact:true}).click();await dialog.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForTimeout(200);assert.equal(await topImage(),'Orange','dialog and panel share layer order');assert.equal(await row('Orange').getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(1100);await page.reload();await page.locator('.ProseMirror img[alt="Orange"]').waitFor();const layers=await page.locator('.ProseMirror .pm-image-wrapper img').evaluateAll(images=>images.map(i=>({alt:i.alt,layer:Number(i.dataset.layer)})));assert.ok(layers.find(i=>i.alt==='Orange').layer>layers.find(i=>i.alt==='Navy').layer);
  if(!await panel.isVisible()){await page.getByRole('menuitem',{name:'View',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Layers',exact:true}).click();}
  await load(`<p>FIXTURE REPLACEMENT</p><p>${img(0,'')}</p>`);assert.equal(await row('Orange').count(),0);assert.equal(await row('Navy').count(),0);await row('Image 1').click();assert.equal(await page.locator('.ProseMirror .pm-image-wrapper.is-selected').count(),1);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);const box=await panel.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=391,JSON.stringify(box));assert.ok(box.height<844*.65,JSON.stringify(box));await page.screenshot({path:path.join(dir,'mobile-panel.png')});
  await page.keyboard.press('Delete');await page.waitForTimeout(150);assert.equal(await page.locator('.ProseMirror .pm-image-wrapper').count(),0);assert.equal(await panel.locator('button[aria-pressed]').count(),0);
  // Images and text boxes share order within a plane; the panel reaches obscured boxes.
  await page.setViewportSize({width:1450,height:1050});await page.waitForTimeout(400);
  const boxNode=attrs=>`<span data-edtr-textbox="${JSON.stringify(attrs).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></span>`;
  const boxBase={position:'page',x:120,y:200,width:'160px',height:120,fontSize:12,background:'#162c48',color:'#ffffff'};
  await load(`<p>FIXTURE MIXED LAYERS</p><p>${img(0,'Mixed image','data-position="page" data-x="120" data-y="200" data-layer="0"')}</p><p>${boxNode({...boxBase,text:'Covered box',layer:1,textPlane:'front'})}</p><p>${boxNode({...boxBase,text:'Behind box',layer:4,textPlane:'behind'})}</p><p>${boxNode({...boxBase,text:'',x:400,layer:0,textPlane:'front'})}</p>`);
  const boxData=async text=>page.locator('.ProseMirror .pm-textbox-wrapper').evaluateAll((nodes,text)=>nodes.map(el=>JSON.parse(el.dataset.edtrTextbox)).find(attrs=>attrs.text===text),text);
  await row('Covered box').waitFor();await row('Text box 3').waitFor();await row('Mixed image').click();await front.click();await page.waitForTimeout(150);
  const imageLayer=()=>page.locator('.ProseMirror img[alt="Mixed image"]').getAttribute('data-layer').then(Number);
  assert.ok(await imageLayer()>(await boxData('Covered box')).layer,'image moves above front-plane text box');assert.equal((await boxData('Behind box')).layer,4,'other text plane untouched');
  await page.keyboard.press('Meta+z');await page.waitForTimeout(150);assert.equal(await imageLayer(),0);assert.equal((await boxData('Covered box')).layer,1);await page.keyboard.press('Meta+Shift+z');await page.waitForTimeout(150);
  await row('Behind box').click();assert.equal(await row('Behind box').getAttribute('aria-pressed'),'true');const behindWrapper=page.locator('.ProseMirror .pm-textbox-wrapper.is-selected');assert.equal(await behindWrapper.count(),1);await behindWrapper.locator('.pm-textbox-edit').click();const boxDialog=page.getByRole('dialog',{name:'Edit text box',exact:true});await boxDialog.waitFor();await boxDialog.getByRole('button',{name:'Cancel',exact:true}).click();await boxDialog.waitFor({state:'hidden'});
  await panel.getByRole('button',{name:'In front of text',exact:true}).click();assert.equal((await boxData('Behind box')).textPlane,'front');await back.click();assert.ok((await boxData('Behind box')).layer<await imageLayer());await page.keyboard.press('Meta+z');await page.waitForTimeout(150);await page.keyboard.press('Meta+z');await page.waitForTimeout(150);assert.equal((await boxData('Behind box')).textPlane,'behind');
  await row('Text box 3').click();assert.equal(await page.locator('.ProseMirror .pm-textbox-wrapper.is-selected').count(),1);await page.keyboard.press('Delete');assert.equal(await row('Text box 3').count(),0);await page.keyboard.press('Meta+z');await row('Text box 3').waitFor();
  // Preserve a genuine mixed image/box ordering through native Word export/import.
  await row('Mixed image').click();await front.click();await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();const wordDownload=page.waitForEvent('download');await page.getByRole('menuitem',{name:'Word (.docx)',exact:true}).click();const mixedWord=path.join(dir,'mixed-layers.docx');await(await wordDownload).saveAs(mixedWord);
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(mixedWord);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForTimeout(600);assert.ok(await page.locator('.ProseMirror .pm-image-wrapper img').first().getAttribute('data-layer').then(Number)>(await boxData('Covered box')).layer,'mixed order survives Word roundtrip');await row('Behind box').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS image/textbox Layers, obscured-object selection/edit controls, mixed same-plane order, undo/redo/delete, flow guard, keyboard, shared dialog, persistence, native Word order, fallback names, empty state and mobile layout. Artifacts: '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
