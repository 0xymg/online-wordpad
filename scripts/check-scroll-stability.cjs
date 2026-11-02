/** Wheel momentum at document end and re-pagination must not bounce the viewport. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}: {})});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:950}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto((process.env.BASE_URL || 'http://localhost:3107')+'/pad');
  await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1200);
  await page.evaluate(()=>{
   localStorage.setItem('wordpad-files',JSON.stringify([{id:'scroll-regression',name:'Scroll regression',html:Array.from({length:220},(_,i)=>`<p>ROW ${i} Scroll stability sample</p>`).join('')}]));
   localStorage.setItem('wordpad-active','scroll-regression');
  });
  await page.reload();await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1000);
  await page.evaluate(()=>{
   window.scrollSamples=[];
   const sample=()=>{const shell=document.querySelector('.editor-shell'),bar=document.querySelector('.editor-title-bar');window.scrollSamples.push({y:shell.scrollTop,collapsed:bar.dataset.collapsed==='true'});window.scrollSampler=requestAnimationFrame(sample);};sample();
  });
  const shell=page.locator('.editor-shell');
  await shell.evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.mouse.move(1100,650);
  for(let i=0;i<25;i++){await page.mouse.wheel(0,20);await page.waitForTimeout(35);}
  await page.waitForTimeout(450);
  const samples=await page.evaluate(()=>window.scrollSamples),collapsed=samples.findIndex(s=>s.collapsed);
  assert.ok(collapsed>=0,'downward scrolling collapses the bar');
  assert.ok(samples.slice(collapsed).every(s=>s.collapsed),'downward wheel momentum must not reopen the bar at the bottom');
  await page.mouse.wheel(0,-400);await page.waitForTimeout(450);
  assert.equal(await page.locator('.editor-title-bar').getAttribute('data-collapsed'),'false','upward scrolling restores the bar');
  await page.locator('.ProseMirror p').last().click();await page.keyboard.press('End');await page.waitForTimeout(700);
  const before=await shell.evaluate(e=>e.scrollTop);
  await page.evaluate(()=>{window.scrollSamples=[];});await page.keyboard.type(' new text');await page.waitForTimeout(500);
  const editing=await page.evaluate(()=>window.scrollSamples);
  assert.ok(editing.every(s=>Math.abs(s.y-before)<2),JSON.stringify({before,editing}));
  await page.mouse.wheel(0,-250);await page.waitForTimeout(450);
  await page.mouse.wheel(0,100);await page.waitForTimeout(70);await page.mouse.wheel(0,-100);await page.waitForTimeout(450);
  assert.equal(await page.locator('.editor-title-bar').getAttribute('data-collapsed'),'false','real input reversal works during the resize animation');
  await page.evaluate(()=>cancelAnimationFrame(window.scrollSampler));
  assert.deepEqual(errors,[]);
  console.log('PASS scroll stability: bottom wheel momentum, reverse direction, resize animation and typing/re-pagination.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
