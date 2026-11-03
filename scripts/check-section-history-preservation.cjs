/* eslint-disable @typescript-eslint/no-require-imports */
/** Historical section properties must never become live layout targets. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const source=fs.readFileSync(path.resolve('lib/docx-preservation.ts'),'utf8').replace('function applySectionLayoutOverrides(', 'export function applySectionLayoutOverrides(');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage();await page.addScriptTag({path:require.resolve('jszip/dist/jszip.min.js')});
  const result=await page.evaluate(async code=>{
   const exports={},moduleContext={exports},require=name=>name==='jszip'?window.JSZip:{};new Function('exports','module','require',code)(exports,moduleContext,require);
   const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships',pk='http://schemas.openxmlformats.org/package/2006/relationships';
   const parse=s=>new DOMParser().parseFromString(s,'application/xml');
   const xml=`<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="12000" w:h="16000"/><w:pgMar w:left="1111" w:right="1111" w:top="1111" w:bottom="1111"/><w:sectPrChange><w:sectPr><w:pgMar w:left="777"/><w:headerReference w:type="default" r:id="old"/></w:sectPr></w:sectPrChange></w:sectPr><w:pPrChange><w:pPr><w:sectPr><w:pgMar w:left="666"/></w:sectPr></w:pPr></w:pPrChange></w:pPr></w:p><w:sectPr><w:pgSz w:w="14000" w:h="18000"/><w:pgMar w:left="2222" w:right="2222" w:top="2222" w:bottom="2222"/><w:sectPrChange><w:sectPr><w:pgSz w:w="9999" w:h="9999"/><w:pgMar w:left="888"/></w:sectPr></w:sectPrChange></w:sectPr></w:body></w:document>`;
   const main=parse(xml),zip=new window.JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');zip.file('word/_rels/document.xml.rels',`<Relationships xmlns="${pk}"><Relationship Id="old" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`);zip.file('word/header1.xml',`<w:hdr xmlns:w="${w}"><w:p/></w:hdr>`);
   const captured=await exports.captureLayout(zip,'word/document.xml',main,parse(`<w:styles xmlns:w="${w}"/>`));
   const live=[...main.getElementsByTagNameNS(w,'sectPr')].filter(s=>['pPr','body'].includes(s.parentElement.localName) && !s.parentElement.closest('pPrChange')),historical=[...main.getElementsByTagNameNS(w,'sectPr')].filter(s=>s.parentElement.localName==='sectPrChange'||s.parentElement.parentElement.localName==='pPrChange'),serial=new XMLSerializer();
   const before=historical.map(s=>serial.serializeToString(s));const firstSource=captured.sectionXml(live[0]);
   exports.applySectionLayoutOverrides(main,{width:18000,height:12000,margins:{top:0,bottom:0,left:0,right:0},sectionMargins:{0:{top:101,right:102,bottom:103,left:104},1:{top:201,right:202,bottom:203,left:204}},overrides:{orientation:true}});
   const left=s=>[...s.children].find(e=>e.localName==='pgMar').getAttributeNS(w,'left');
   return {width:captured.layout.width,final:captured.layout.section,firstSource,before,after:historical.map(s=>serial.serializeToString(s)),left:live.map(left),sizes:live.map(s=>[...s.children].find(e=>e.localName==='pgSz').getAttributeNS(w,'w')),source:captured.layout.source};
  },code);
  assert.equal(result.width,12000);assert.match(result.final,/w:w="14000"/);assert.match(result.final,/w:w="9999"/);assert.match(result.firstSource,/EDTRSource_old/);assert.deepEqual(result.after,result.before);assert.deepEqual(result.left,['104','204']);assert.deepEqual(result.sizes,['18000','18000']);
  const archive=await require('jszip').loadAsync(result.source,{base64:true});assert.ok(archive.file('word/header1.xml'));assert.match(await archive.file('edtr-relations.xml').async('string'),/EDTRSource_old/);
  console.log('PASS live section import/export indexing, historical XML and relationship preservation');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
