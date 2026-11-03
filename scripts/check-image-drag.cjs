/** Drag real editor images without native drag/drop, preserving page geometry and history. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-image-drag-'));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  const page=await browser.newPage({viewport:{width:1450,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto((process.env.BASE_URL||'http://localhost:3107')+'/pad');await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1100);
  const src=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=120;const x=c.getContext('2d');x.fillStyle='#e38723';x.fillRect(0,0,160,120);return c.toDataURL();});
  const img=extra=>`<img src="${src}" alt="Drag sample" data-width="160px" data-aspect-ratio="1.3333333333" ${extra||''}>`;
  const image=page.locator('.ProseMirror .pm-image-wrapper img').first();
  async function load(html){const file=path.join(dir,'fixture.html');await fs.writeFile(file,html);await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('FIXTURE'));await page.waitForTimeout(400);}
  async function facts(){return image.evaluate(img=>{const root=img.closest('.ProseMirror'),host=img.closest('.pm-page'),scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width),r=img.getBoundingClientRect(),p=host.getBoundingClientRect();return{x:(r.left-p.left)/scale,y:(r.top-p.top)/scale,width:r.width/scale,height:r.height/scale,position:img.dataset.position,storedX:Number(img.dataset.x),storedY:Number(img.dataset.y),align:img.dataset.align,layer:img.dataset.layer,count:root.querySelectorAll('.pm-image-wrapper').length};});}
  async function gesture(dx,dy,cancel=false){await image.evaluate(img=>img.scrollIntoView({block:"center"}));await page.waitForTimeout(600);const r=await image.boundingBox();const x=r.x+r.width*.45,y=r.y+r.height*.8;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(250);}
  const near=(actual,wanted,message)=>assert.ok(Math.abs(actual-wanted)<1.5,`${message}: ${actual} != ${wanted}`);
  await load(`<p>FIXTURE START</p><p>${img()}ANCHOR TEXT</p><p>FOLLOWING TEXT</p>`);
  let before=await facts();await image.click({position:{x:65,y:90}});assert.equal((await facts()).position,'flow','click alone must not change layout');
  await gesture(100,70);let after=await facts();assert.equal(after.position,'page');near(after.x,before.x+100,'flow drag x');near(after.y,before.y+70,'flow drag y');near(after.width,160,'preserve width');assert.equal(after.count,1);
  assert.equal(await page.getByRole('button',{name:'Left',exact:true}).getAttribute('aria-pressed'),'false','manual drag clears stale alignment');
  await page.keyboard.press('Meta+z');await page.waitForTimeout(200);assert.equal((await facts()).position,'flow');near((await facts()).x,before.x,'undo x');await page.keyboard.press('Meta+Shift+z');await page.waitForTimeout(200);assert.equal((await facts()).position,'page');
  before=await facts();await gesture(80,50,true);after=await facts();near(after.x,before.x,'Escape x');near(after.y,before.y,'Escape y');
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'50%',exact:true}).click();await page.waitForTimeout(250);before=await facts();await gesture(30,20);after=await facts();near(after.x,before.x+60,'50% drag x');near(after.y,before.y+40,'50% drag y');
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'100%',exact:true}).click();await page.waitForTimeout(200);await page.waitForTimeout(1100);await page.reload();await image.waitFor();near((await facts()).storedX,after.storedX,'reload x');near((await facts()).storedY,after.storedY,'reload y');
  // Dragging against the page edge clamps the picture without moving its anchor.
  await image.evaluate(img=>img.scrollIntoView({block:"center"}));await page.waitForTimeout(300);
  { const r=await image.boundingBox(), sheet=await page.locator(".pm-page").boundingBox(); await page.mouse.move(r.x+65,r.y+90);await page.mouse.down();await page.mouse.move(sheet.x+2,sheet.y+2,{steps:8});await page.mouse.up();await page.waitForTimeout(250); }
  after=await facts();near(after.storedX,0,'left edge');near(after.storedY,0,'top edge');assert.equal(after.count,1);await page.keyboard.press('Meta+z');await page.waitForTimeout(250);
  // Explicit second-page anchor, selection/deletion, and one-step move undo.
  await load(`<p>FIXTURE FIRST PAGE</p><hr data-page-break="true"><p>${img('data-position="page" data-x="120" data-y="180" data-layer="4" data-align=""')}SECOND PAGE</p>`);
  before=await facts();await gesture(75,45);after=await facts();near(after.y,before.y+45,'second-page drag y');near(after.storedX,195,'second-page X');near(after.storedY,225,'second-page Y');assert.equal(after.layer,'4');assert.equal(after.count,1);
  await page.keyboard.press('Meta+z');await page.waitForTimeout(250);near((await facts()).storedX,120,'single undo');await page.keyboard.press('Meta+Shift+z');await page.waitForTimeout(250);
  await page.keyboard.press('Delete');assert.equal(await page.locator('.ProseMirror .pm-image-wrapper').count(),0);await page.keyboard.press('Meta+z');await image.waitFor();assert.equal((await facts()).count,1);
  await page.screenshot({path:path.join(dir,'dragged-page-two.png')});
  // A flow image pushed onto page two must stay there when removed from text flow.
  await load(Array.from({length:28},(_,i)=>`<p>FIXTURE BEFORE ${i}</p>`).join('')+`<p>${img('data-wrap="wrapRight"')}BOUNDARY ANCHOR</p><p>END</p>`);
  before=await facts();assert.ok(before.y>1122,'boundary fixture starts on page two');await gesture(-30,25);after=await facts();near(after.y,before.y+25,'natural page boundary preserved');assert.equal(after.count,1);
  await page.keyboard.press('Meta+z');await page.waitForTimeout(250);assert.equal((await facts()).position,'flow');near((await facts()).y,before.y,'natural boundary undo');
  assert.deepEqual(errors,[]);
  console.log('PASS body drag, click-only selection, flow conversion, fixed coordinates, Escape, single undo/redo, 50% zoom, page edges, reload, page two, preserved layer and deletion. Artifacts: '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
