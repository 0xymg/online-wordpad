/* eslint-disable @typescript-eslint/no-require-imports */
/** DOCX style border import regression; requires the running local editor. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-border-'));
 const source = await fs.readFile(path.join(__dirname, '../fixtures/compatibility/basic.docx'));
 const zip = await JSZip.loadAsync(source);
 const styles = await zip.file('word/styles.xml').async('string');
 assert(styles.includes('<w:bottom w:val="single" w:sz="8" w:space="4" w:color="4F81BD"'));
 zip.file('word/styles.xml', styles.replace('<w:bottom w:val="single" w:sz="8" w:space="4" w:color="4F81BD" w:themeColor="accent1"', '<w:bottom w:val="single" w:sz="16" w:space="7" w:color="123456"'));
 const varied = path.join(temp, 'varied.docx'); await fs.writeFile(varied, await zip.generateAsync({type:'nodebuffer'}));
 const themeZip = await JSZip.loadAsync(source);
 themeZip.file('word/styles.xml', styles.replace('w:color="4F81BD" w:themeColor="accent1"', 'w:color="ABCDEF" w:themeColor="accent1"'));
 const themed = path.join(temp, 'themed.docx'); await fs.writeFile(themed, await themeZip.generateAsync({type:'nodebuffer'}));
 const documentXml = await zip.file('word/document.xml').async('string');
 assert(documentXml.includes('<w:pStyle w:val="Title"/>'));
 zip.file('word/document.xml', documentXml.replace('<w:pStyle w:val="Title"/>', '<w:pStyle w:val="Title"/><w:pBdr><w:bottom w:val="nil"/></w:pBdr>'));
 const disabled = path.join(temp, 'disabled.docx'); await fs.writeFile(disabled, await zip.generateAsync({type:'nodebuffer'}));
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  let page = await browser.newPage(); await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad');
  await page.locator('.ProseMirror').waitFor(); await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({state:'hidden'});
  const load = async file => { await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file); const replace = page.getByRole('button',{name:'Replace document',exact:true}); await replace.waitFor({state:'visible',timeout:3000}).then(()=>replace.click()).catch(()=>{}); await page.getByText('Basic section fixture',{exact:true}).first().waitFor(); };
  await load(varied);
  const title = page.locator('.ProseMirror p').filter({hasText:'Basic section fixture'}).first();
  const values = await title.evaluate(el => { const s=getComputedStyle(el); return {width:s.borderBottomWidth,style:s.borderBottomStyle,color:s.borderBottomColor,padding:s.paddingBottom}; });
  assert.equal(values.style,'solid'); assert(parseFloat(values.width) >= 2 && parseFloat(values.width) <= 3); assert.equal(values.color,'rgb(18, 52, 86)'); assert(Math.abs(parseFloat(values.padding) - 28/3) < 0.02);
  await page.close(); page = await browser.newPage(); await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad'); await page.locator('.ProseMirror').waitFor(); await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({state:'hidden'});
  await load(disabled);
  await page.waitForFunction(() => { const p = [...document.querySelectorAll('.ProseMirror p')].find(el => el.textContent.includes('Basic section fixture')); return p && parseFloat(getComputedStyle(p).borderBottomWidth) === 0; }, null, {timeout:3000});
  assert.equal(await page.locator('.ProseMirror p').filter({hasText:'Basic section fixture'}).first().evaluate(el => getComputedStyle(el).borderBottomWidth), '0px');
  await page.close(); page = await browser.newPage(); await page.goto((process.env.BASE_URL || 'http://localhost:3107') + '/pad'); await page.locator('.ProseMirror').waitFor(); await page.locator('.editor-shell > div[aria-hidden="true"]').waitFor({state:'hidden'});
  await load(themed);
  assert.equal(await page.locator('.ProseMirror p').filter({hasText:'Basic section fixture'}).first().evaluate(el => getComputedStyle(el).borderBottomColor), 'rgb(79, 129, 189)');
  console.log('PASS inherited border width, explicit and theme colors, spacing, and direct nil override');
 } finally { await browser.close(); await fs.rm(temp,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1});
