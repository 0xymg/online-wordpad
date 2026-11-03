/** Exercise canonical section-to-native OOXML mapping in a real DOM. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const filename=path.join(__dirname,'../lib/docx-preservation.ts');
 const source=fs.readFileSync(filename,'utf8').replace('function applyModeledSections(', 'export function applyModeledSections(');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage();
  const result=await page.evaluate(code=>{
   const exports={};const module={exports}; const require=()=>({});new Function('exports','module','require',code)(exports,module,require);
   const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
   const xml=`<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="h1"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:pgNumType w:start="3"/><w:docGrid w:linePitch="360"/></w:sectPr></w:pPr></w:p><w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
   const doc=new DOMParser().parseFromString(xml,'application/xml'),model={finalSectionId:'s2',sections:{s1:{page:{width:12240,height:15840,margins:{top:1440,right:1440,bottom:1440,left:1440}},start:'nextPage',numbering:{start:3}},s2:{page:{width:16838,height:11906,margins:{top:900,right:1080,bottom:1200,left:1800}},start:'continuous',numbering:{format:'upperRoman'}}}};
   const pm={attrs:{documentModel:model},forEach(fn){fn({attrs:{sectionEndId:'s1'}});fn({attrs:{sectionEndId:null}})}};exports.applyModeledSections(doc,pm);
   const all=[...doc.getElementsByTagNameNS(w,'sectPr')],v=(e,n)=>e.getAttributeNS(w,n),child=(e,n)=>[...e.children].find(x=>x.localName===n);
   let bad=false;try{exports.applyModeledSections(doc,{attrs:{documentModel:model},forEach(fn){fn({attrs:{sectionEndId:'missing'}})}})}catch{bad=true}
   return {sizes:all.map(s=>[v(child(s,'pgSz'),'w'),v(child(s,'pgSz'),'h'),v(child(s,'pgSz'),'orient')]),types:all.map(s=>v(child(s,'type'),'val')),margins:['top','right','bottom','left'].map(n=>v(child(all[1],'pgMar'),n)),headers:child(all[0],'headerReference').getAttributeNS(r,'id'),grid:v(child(all[0],'docGrid'),'linePitch'),start:v(child(all[0],'pgNumType'),'start'),format:v(child(all[1],'pgNumType'),'fmt'),bad};
  },code);
  assert.deepEqual(result.sizes,[['12240','15840','portrait'],['16838','11906','landscape']]);assert.deepEqual(result.types,['nextPage','continuous']);assert.deepEqual(result.margins,['900','1080','1200','1800']);assert.equal(result.headers,'h1');assert.equal(result.grid,'360');assert.equal(result.start,'3');assert.equal(result.format,'upperRoman');assert.equal(result.bad,true);
  console.log('PASS model-to-DOCX geometry, starts, numbering, header/unknown-property preservation and invalid boundaries');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
