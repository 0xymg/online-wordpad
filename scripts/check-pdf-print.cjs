/** Real browser PDF and native-print regression. Fixtures never use user files. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Document,Packer,Paragraph,TextRun,Header,Footer,PageNumber,PageBreak,PageOrientation,ImageRun,Table,TableRow,TableCell,WidthType}=require('docx');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-pdf-print-'));
 const numbered=text=>new Footer({children:[new Paragraph({alignment:'center',children:[new TextRun({children:[text+' ',PageNumber.CURRENT,' / ',PageNumber.TOTAL_PAGES],font:'Calibri',size:20})]})]});
 const header=text=>new Header({children:[new Paragraph({children:[new TextRun({text,bold:true,color:'163C68',size:24}),new ImageRun({type:'png',data:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64'),transformation:{width:28,height:10}})]})]});
 const bodies=letters=>letters.flatMap((letter,index)=>[...(index?[new Paragraph({children:[new PageBreak()]})]:[]),new Paragraph(`BODY ${letter} unique content.`)]);
 const source=path.join(dir,'sections.docx');
 await fs.writeFile(source,await Packer.toBuffer(new Document({evenAndOddHeaderAndFooters:true,styles:{default:{document:{run:{font:'Calibri',size:22}}}},sections:[
 {properties:{titlePage:true,page:{size:{width:11906,height:16838},margin:{top:1440,bottom:1440,left:1800,right:1080,header:360,footer:360}}},headers:{default:header('NORMAL HEADER'),first:header('FIRST HEADER'),even:header('EVEN HEADER')},footers:{default:numbered('NORMAL FOOTER'),first:numbered('FIRST FOOTER'),even:numbered('EVEN FOOTER')},children:bodies(['A','B','C'])},
 {properties:{page:{size:{width:12240,height:15840,orientation:PageOrientation.LANDSCAPE},margin:{top:1080,bottom:1440,left:1440,right:1080,header:360,footer:360},pageNumbers:{start:7}}},footers:{default:numbered('SECTION TWO'),even:numbered('SECTION TWO EVEN')},children:bodies(['D','E'])}
 ]})));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});try{
 const base=process.env.BASE_URL||'http://localhost:3107', page=await browser.newPage({viewport:{width:1550,height:1100}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/pad');await page.locator('.ProseMirror').waitFor();await page.waitForTimeout(1000);
 await page.locator('input[type=file][accept*=".docx"]').setInputFiles(source);await page.waitForFunction(()=>document.querySelector('.pm-running-header')?.textContent.includes('FIRST HEADER'));
 async function exportPdf(name){await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();const event=page.waitForEvent('download');await page.getByRole('menuitem',{name:'PDF (.pdf)',exact:true}).click();const file=path.join(dir,name);await(await event).saveAs(file);return file;}
 await exportPdf('export.pdf');
 await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'50%',exact:true}).click();await page.waitForTimeout(350);await exportPdf('zoom-50.pdf');
 await page.getByRole('combobox',{name:'Zoom',exact:true}).click();await page.getByRole('option',{name:'100%',exact:true}).click();await page.waitForTimeout(350);
 // Intercept the native print call, retaining the exact document sent to it.
 page.on('frameattached',async frame=>{try{await frame.evaluate(()=>{window.print=()=>{window.top.__printedHtml=document.documentElement.outerHTML;};});}catch{}});
 async function nativePrint(name) {
  await page.evaluate(()=>{delete window.__printedHtml;});
  await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:/^Print\b/}).click();
  await page.waitForFunction(()=>window.__printedHtml,{timeout:20000});
  const html=await page.evaluate(()=>window.__printedHtml);await fs.writeFile(path.join(dir,name+'.html'),html);
  const printPage=await browser.newPage();await printPage.route('**/__print-fixture',route=>route.fulfill({contentType:'text/html',body:html}));await printPage.goto(base+'/__print-fixture',{waitUntil:'networkidle'});await printPage.evaluate(()=>document.fonts.ready);await printPage.pdf({path:path.join(dir,name+'.pdf'),preferCSSPageSize:true,printBackground:true});
  const sheets=printPage.locator('.edtr-print-sheet'),count=await sheets.count();
  // Put each sample at y=0: scrolling to fractional paper offsets can add a
  // rounded pixel to Playwright's crop, obscuring genuine PDF layout changes.
  for(let index=0;index<Math.min(count,2);index++){await sheets.evaluateAll((nodes,index)=>nodes.forEach((node,i)=>node.style.display=i===index?'block':'none'),index);await sheets.nth(index).screenshot({path:path.join(dir,name+(index?'-second':'-first')+'-sheet.png')});}
  await printPage.close();return count;
 }
 assert.equal(await nativePrint('print'),5);
 await page.getByRole('menuitem',{name:'Insert',exact:true}).click();await page.getByRole('menuitem',{name:'Header & footer…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Header & footer',exact:true});await dialog.getByRole('combobox',{name:'Section',exact:true}).selectOption('1');
 const footer=dialog.locator('.running-editor').filter({has:page.getByRole('textbox',{name:'Footer',exact:true})});await footer.getByRole('textbox').fill('EDITED PDF FOOTER ');await footer.getByRole('button',{name:'Page number',exact:true}).click();await page.keyboard.type(' / ');await footer.getByRole('button',{name:'Total pages',exact:true}).click();await footer.getByRole('combobox').selectOption('right');await dialog.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.pm-running-footer')).some(el=>el.textContent.includes('EDITED PDF FOOTER')));
 await exportPdf('edited.pdf');
 await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Print title, date & site credit',exact:true}).click();await exportPdf('credits.pdf');await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Print title, date & site credit',exact:true}).click();
 const natural=path.join(dir,'natural.docx');
 await fs.writeFile(natural,await Packer.toBuffer(new Document({styles:{default:{document:{run:{font:'Calibri',size:22}}}},sections:[{properties:{page:{margin:{top:1440,bottom:1440,left:1440,right:1440,header:360,footer:360}}},headers:{default:header('NATURAL HEADER')},footers:{default:numbered('LONG FOOTER')},children:[new Paragraph('LONG BODY BEGIN'),new Table({width:{size:9000,type:WidthType.DXA},columnWidths:[4500,4500],rows:Array.from({length:95},(_,i)=>new TableRow({children:[new TableCell({children:[new Paragraph('LONG ROW '+i)]}),new TableCell({children:[new Paragraph('COMPANION '+i)]})]}))}),new Paragraph('LONG BODY END')]}]})));
 await page.locator('.ProseMirror').fill('Import pending');await page.locator('input[type=file][accept*=".docx"]').setInputFiles(natural);await page.getByRole('button',{name:'Replace document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pm-running-header')?.textContent.includes('NATURAL HEADER'));
 await exportPdf('natural-export.pdf');const naturalPages=await nativePrint('natural-print');assert.ok(naturalPages>=3);
 assert.deepEqual(errors,[]);
 console.log('PASS PDF and native print export; inspect per-page text, fields, geometry and rendered pages. Artifacts: '+dir);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
