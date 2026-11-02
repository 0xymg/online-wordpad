/** Isolated browser regression for visual pagination; fixtures never touch user documents. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const esc = s => s.replaceAll('&','&amp;').replaceAll('"','&quot;');
const layout = { width: 11906, height: 16838, margins: { top: 720, right: 1080, bottom: 1440, left: 1800 }, pageNumbers: 'bottom', pageNumberFormat: 'of' };
(async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-pagination-'));
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  page.setDefaultTimeout(15000);
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto((process.env.BASE_URL || 'http://localhost:3107')+'/pad');
  await page.locator('.ProseMirror').waitFor();
  async function load(html) {
   await page.waitForTimeout(1100);
   await page.evaluate(({html,layout}) => {
    localStorage.setItem('wordpad-files',JSON.stringify([{id:'pagination-test',name:'Pagination test',html:`<div data-edtr-layout="${JSON.stringify(layout).replaceAll('"','&quot;')}">${html}</div>`}]));
    localStorage.setItem('wordpad-active','pagination-test');
   },{html,layout});
   await page.reload(); await page.locator('.ProseMirror').waitFor();
   await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('FIXTURE'), null, { timeout: 15000 });
   await page.waitForTimeout(700);
  }
  async function facts(label) {
   const result = await page.evaluate(()=>{
    const p=document.querySelector('.pm-page'),e=document.querySelector('.ProseMirror'),r=p.getBoundingClientRect();
    return {height:r.height,gaps:Array.from(e.querySelectorAll('.pm-page-spacer-gap')).map(g=>g.getBoundingClientRect().top-r.top),headers:e.querySelectorAll('.pm-repeated-header').length,rows:e.querySelectorAll('tr:not(.pm-pagination-row)').length,padding:e.style.paddingBottom,text:e.textContent};
   });
   await fs.writeFile(path.join(dir,label+'.json'),JSON.stringify(result,null,2));
   return result;
  }
  const header=`<tr data-docx-properties="${esc(`<w:trPr xmlns:w="${W}"><w:tblHeader w:val="1"/></w:trPr>`)}"><th><p>FIXTURE HEADER</p></th><th><p>Value</p></th></tr>`;
  await load(`<table>${header}${Array.from({length:100},(_,i)=>`<tr><td><p>Row ${i}</p></td><td><p>Content ${i}</p></td></tr>`).join('')}</table><p>END TABLE</p>`);
  let table = await facts('table');
  assert.ok(table.gaps.length>=3,'long table needs row boundaries');
  assert.equal(table.headers,table.gaps.length,'repeat header on each continuation');
  const source = await page.evaluate(() => JSON.parse(localStorage.getItem('wordpad-files'))[0].html);
  assert.ok(!source.includes('pm-repeated-header') && !source.includes('pm-page-spacer'));
  assert.equal((source.match(/FIXTURE HEADER/g) || []).length, 1);
  const pageHeight=layout.height/15;
  assert.ok(Math.abs(table.height-((table.gaps.length+1)*pageHeight+table.gaps.length*26))<3, `last page height ${table.height}`);
  for(let i=0;i<table.gaps.length;i++) assert.ok(Math.abs(table.gaps[i]-(pageHeight+i*(pageHeight+26)))<8,`table boundary ${i}: ${table.gaps[i]}`);
  await page.screenshot({path:path.join(dir,'table.png'),fullPage:true});
  await page.locator('.editor-shell').evaluate(e => { e.scrollTop = 850; });
  await page.screenshot({path:path.join(dir,'table-boundary.png')});
  await page.locator('.editor-shell').evaluate(e => { e.scrollTop = 0; });
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click();
  await page.getByRole('option',{name:'150%',exact:true}).click();
  await page.waitForTimeout(500);
  const zoomed=await facts('zoom'); assert.equal(zoomed.gaps.length,table.gaps.length);
  await page.getByRole('combobox',{name:'Zoom',exact:true}).click(); await page.getByRole('option',{name:'100%',exact:true}).click();
  await load(`<p>FIXTURE LARGE CELLS</p><table><tr><td colspan="2" style="background-color:#dbeafe">${Array.from({length:90},(_,i)=>`<p>LEFT ${i} ${'Long cell text for wrapping. '.repeat(4)}</p>`).join('')}</td><td>${Array.from({length:15},(_,i)=>`<p>RIGHT ${i} shorter column content</p>`).join('')}</td></tr></table><p>END LARGE CELLS</p>`);
  const aligned = await page.locator('.ProseMirror td').evaluateAll(cells => cells.map(c => Array.from(c.querySelectorAll('.pm-page-spacer-gap')).map(g => g.getBoundingClientRect().top)));
  await fs.writeFile(path.join(dir,'cell-boundaries.json'),JSON.stringify(aligned));
  assert.ok(aligned[0].length >= 3, 'oversized row should span several pages');
  assert.equal(aligned[0].length, aligned[1].length, 'both cells must cross every page boundary');
  aligned[0].forEach((top,i)=>assert.ok(Math.abs(top-aligned[1][i])<2, `cell boundary ${i} is misaligned`));
  assert.equal(await page.locator('.ProseMirror td').first().getAttribute('colspan'),'2');
  await page.locator('.editor-shell').evaluate(e=>{e.scrollTop=850;});
  await page.screenshot({path:path.join(dir,'large-cells.png')});
  await load(`<p>FIXTURE VERTICAL MERGE</p><table><tr><td rowspan="3">${Array.from({length:95},(_,i)=>`<p>SPAN ${i} ${'Text across several physical pages. '.repeat(3)}</p>`).join('')}</td><td>${Array.from({length:12},(_,i)=>`<p>ROW ONE ${i}</p>`).join('')}</td></tr><tr><td>${Array.from({length:8},(_,i)=>`<p>ROW TWO ${i}</p>`).join('')}</td></tr><tr><td>${Array.from({length:12},(_,i)=>`<p>ROW THREE ${i}</p>`).join('')}</td></tr></table><p>END VERTICAL</p>`);
  const vertical = await page.locator('.ProseMirror td').evaluateAll(cells => cells.map(c => Array.from(c.querySelectorAll('.pm-page-spacer-gap')).map(g => g.getBoundingClientRect().top)));
  await fs.writeFile(path.join(dir,'vertical-boundaries.json'),JSON.stringify(vertical));
  assert.ok(vertical[0].length >= 3, 'rowspan must cross several pages');
  for (const other of vertical.slice(1)) for (const top of other) assert.ok(vertical[0].some(primary=>Math.abs(primary-top)<2),`rowspan companion ${top} is misaligned`);
  assert.equal(await page.locator('.ProseMirror td').first().getAttribute('rowspan'),'3');
  await page.locator('.editor-shell').evaluate(e=>{e.scrollTop=850;});
  await page.screenshot({path:path.join(dir,'vertical-merge.png')});
  await load(`<p>FIXTURE LIST</p><ol>${Array.from({length:140},(_,i)=>`<li><p>Item ${i} with a little more text.</p></li>`).join('')}</ol>`);
  const list=await facts('list'); assert.ok(list.gaps.length>=3,'long list must split');
  for(let i=0;i<list.gaps.length;i++) assert.ok(Math.abs(list.gaps[i]-(pageHeight+i*(pageHeight+26)))<8,`list boundary ${i}: ${list.gaps[i]}`);
  await load(`<p>FIXTURE PARAGRAPH ${'A sentence for wrapping and pagination. '.repeat(700)}</p>`);
  const paragraph=await facts('paragraph'); assert.ok(paragraph.gaps.length>=3);
  await page.locator('.editor-shell').evaluate(e=>{e.scrollTop=900;});
  await page.mouse.click(550,550);
  const before=await page.locator('.editor-shell').evaluate(e=>e.scrollTop);
  await page.locator('.ProseMirror').press('ArrowDown'); await page.waitForTimeout(300);
  const after=await page.locator('.editor-shell').evaluate(e=>e.scrollTop);
  assert.ok(Math.abs(after-before)<200,'selection-only update should not reset scroll');
  await load('<p>FIXTURE FIRST</p><hr data-page-break="true"><p>SECOND</p><hr data-page-break="true"><p>THIRD</p>');
  const manual=await facts('manual'); assert.equal(manual.gaps.length,2);
  await load('<p>FIXTURE SHORT</p>'); const short=await facts('short'); assert.equal(short.gaps.length,0); assert.equal(short.padding,''); assert.ok(short.height<pageHeight+5);
  assert.deepEqual(errors,[]);
  console.log('PASS pagination: tables, repeated headers, lists, paragraphs, page boundaries, zoom, scroll stability, manual breaks and long-to-short reload. Artifacts: '+dir);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
