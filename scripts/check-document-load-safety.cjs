/* eslint-disable @typescript-eslint/no-require-imports */
/** Unsupported startup preservation + migration persistence + actual UI history isolation. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const future='<div data-edtr-model="{&quot;version&quot;:99}"><p>FUTURE SOURCE MUST SURVIVE</p></div>';
  await page.addInitScript(({future})=>{if(localStorage.getItem('edtr-load-test'))return;localStorage.setItem('edtr-load-test','seeded');localStorage.setItem('wordpad-files',JSON.stringify([{id:'future-fixture',name:'Future document',html:future}]));localStorage.setItem('wordpad-active','future-fixture');},{future});
  await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad');await page.locator('.ProseMirror[contenteditable="false"]').waitFor();await page.waitForTimeout(1100);
  const original=await page.evaluate(()=>localStorage.getItem('wordpad-files'));
  await page.locator('.ProseMirror').click();await page.keyboard.type('SHOULD NOT SAVE');await page.waitForTimeout(1400);
  await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:/^Save now/}).click();await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>localStorage.getItem('wordpad-files')),original,'typing and save never overwrite unsupported source');
  assert.equal(JSON.parse(original)[0].html,future);assert.ok(await page.getByRole('alert').count());
  await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'New',exact:true}).click();
  await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.locator('.ProseMirror[contenteditable="true"]').waitFor();await page.waitForTimeout(300);
  const versions=await page.evaluate(()=>JSON.parse(localStorage.getItem('wordpad-versions')||'{}'));
  assert.ok(Object.values(versions).flat().some(version=>version.html===future),'explicit replacement backs up original unsupported HTML');
  await page.locator('.ProseMirror').fill('NEW DOCUMENT');await page.waitForTimeout(1100);await page.keyboard.press('Meta+z');await page.waitForTimeout(200);
  assert.doesNotMatch(await page.locator('.ProseMirror').innerText(),/FUTURE|SHOULD NOT SAVE/,'undo cannot resurrect rejected or previous document');
  await page.keyboard.press('Meta+Shift+z');await page.waitForTimeout(200);assert.match(await page.locator('.ProseMirror').innerText(),/NEW DOCUMENT/);
  const beforeReload=await page.evaluate(()=>JSON.parse(localStorage.getItem('wordpad-files'))[0].html);assert.match(beforeReload,/data-edtr-model/,'new document stores versioned model');
  const modelBefore=await page.evaluate(html=>JSON.parse(new DOMParser().parseFromString(html,'text/html').querySelector('[data-edtr-model]').getAttribute('data-edtr-model')),beforeReload);
  assert.equal(modelBefore.version,4,'reference-capable documents persist model version 4');
  await page.reload();await page.locator('.ProseMirror[contenteditable="true"]').waitFor();await page.waitForTimeout(1100);
  const modelAfter=await page.evaluate(()=>JSON.parse(new DOMParser().parseFromString(JSON.parse(localStorage.getItem('wordpad-files'))[0].html,'text/html').querySelector('[data-edtr-model]').getAttribute('data-edtr-model')));
  assert.deepEqual(modelAfter,modelBefore,'reopen with no typing preserves persisted identities');
  // Version 2 is upgraded at startup and saved without reallocating identities.
  await page.evaluate(({html, model})=>{
   const root=new DOMParser().parseFromString(html,'text/html');
   const old=JSON.parse(JSON.stringify(model)); old.version=2;
   for(const record of Object.values(old.sections)){delete record.columns;delete record.flowDirection;}
   root.querySelector('[data-edtr-model]').setAttribute('data-edtr-model',JSON.stringify(old));
   localStorage.setItem('wordpad-files',JSON.stringify([{id:'v2-fixture',name:'V2 document',html:root.body.innerHTML}]));
   localStorage.setItem('wordpad-active','v2-fixture');
  },{html:beforeReload,model:modelBefore});
  await page.reload();await page.locator('.ProseMirror[contenteditable="true"]').waitFor();await page.waitForTimeout(1300);
  const v2Saved=await page.evaluate(()=>JSON.parse(new DOMParser().parseFromString(JSON.parse(localStorage.getItem('wordpad-files'))[0].html,'text/html').querySelector('[data-edtr-model]').getAttribute('data-edtr-model')));
  assert.equal(v2Saved.version,4,'v2 startup migration is persisted without typing');
  assert.equal(v2Saved.id,modelBefore.id,'document identity survives v2 startup migration');
  assert.equal(v2Saved.finalSectionId,modelBefore.finalSectionId,'final section identity survives v2 startup migration');
  assert.deepEqual(Object.keys(v2Saved.sections),Object.keys(modelBefore.sections),'all section identities survive v2 startup migration');
  // A legacy document is persisted after validated migration, even without typing.
  await page.evaluate(()=>{localStorage.setItem('wordpad-files',JSON.stringify([{id:'legacy-fixture',name:'Legacy document',html:'<p>LEGACY SOURCE</p>'}]));localStorage.setItem('wordpad-active','legacy-fixture');});
  await page.reload();await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1300);
  const migrated=await page.evaluate(()=>JSON.parse(localStorage.getItem('wordpad-files'))[0].html);assert.match(migrated,/data-edtr-model/);assert.match(migrated,/LEGACY SOURCE/);
  await page.reload();await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wordpad-files'))[0].html),migrated,'legacy migration is stored once, idempotently');
  assert.deepEqual(errors,[]);console.log('PASS unsupported startup HTML preservation after typing/save, explicit replacement backup, recovery, history isolation, versioned identity persistence and no-typing legacy migration.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
