/** Export synthetic fixtures from a fresh, isolated browser context per case. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'fixtures/compatibility');
const outDir = path.join(fixtureDir, 'app-pdfs');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
 const manifest = JSON.parse(await fs.readFile(path.join(fixtureDir, 'manifest.json'), 'utf8'));
 const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
 const base=process.env.BASE_URL || 'http://localhost:3107', results=[];
 await fs.mkdir(outDir,{recursive:true});
 try {
  for (const fixture of manifest.fixtures) {
   const source=path.join(fixtureDir,fixture.source), output=path.join(outDir,fixture.id+'.pdf');
   const result={id:fixture.id,source_sha256:fixture.sha256,status:'ERROR'}; results.push(result);
   // Never leave an old PDF under the new fixture's name if export fails.
   await fs.rm(output,{force:true});
   const context=await browser.newContext({viewport:{width:1450,height:1050},acceptDownloads:true});
   try {
    const bytes=await fs.readFile(source); if(hash(bytes)!==fixture.sha256) throw new Error('Source hash differs from manifest');
    const page=await context.newPage(); page.setDefaultTimeout(30000);
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/pad',{waitUntil:'domcontentloaded'}); await page.locator('.ProseMirror').waitFor(); await page.waitForTimeout(1100);
    await page.locator('.ProseMirror').fill('Import pending');
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles(source);
    await page.getByRole('button',{name:'Replace document',exact:true}).click();
    const marker=fixture.expected.tokens_once[0];
    await page.waitForFunction(token=>document.querySelector('.ProseMirror')?.textContent.includes(token),marker);
    await page.waitForTimeout(800);
    await page.getByRole('menuitem',{name:'File',exact:true}).click();
    await page.getByRole('menuitem',{name:'Export',exact:true}).hover();
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.getByRole('menuitem',{name:'PDF (.pdf)',exact:true}).click()]);
    await download.saveAs(output); const pdf=await fs.readFile(output);
    if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Downloaded file is not a PDF');
    Object.assign(result,{status:'EXPORTED',pdf_sha256:hash(pdf),pdf_bytes:pdf.length,page_errors:errors});
    console.log(fixture.id+': EXPORTED');
   } catch(error) {
    await fs.rm(output,{force:true}); result.error=String(error?.message || error); console.error(fixture.id+': ERROR '+result.error);
   } finally { await context.close(); }
  }
 } finally { await browser.close(); }
 const exportReport={schema_version:1,base_url:base,captured_at:new Date().toISOString(),results};
 await fs.writeFile(path.join(outDir,'exports.json'),JSON.stringify(exportReport,null,2)+'\n');
 if(results.some(r=>r.status!=='EXPORTED')) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
