/** Independent native carrier/relationship roundtrip and edit refusal. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edtr-bib-docx-')),entry=path.join(dir,'entry.js'),loader=path.join(dir,'loader.cjs');
 fs.writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;`);
 fs.writeFileSync(entry,`import JSZip from ${JSON.stringify(require.resolve('jszip/dist/jszip.min.js'))}; import * as adapter from ${JSON.stringify(path.resolve('lib/bibliography-docx.ts'))};window.adapter=adapter;window.JSZip=JSZip;`);
 await new Promise((ok,bad)=>webpack({mode:'development',entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{jszip:require.resolve('jszip/dist/jszip.min.js')},extensions:['.js','.ts'],modules:[path.resolve('node_modules'),'node_modules']},module:{rules:[{test:/\.ts$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?bad(e||Error(s.toString())):ok()));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {const page=await browser.newPage();await page.route('http://localhost:39876/**',route=>route.fulfill({body:'<!doctype html><html></html>',contentType:'text/html'}));await page.goto('http://localhost:39876/');await page.addScriptTag({path:path.join(dir,'bundle.js')});
 const result=await page.evaluate(async()=>{
 const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',p='http://schemas.openxmlformats.org/package/2006/relationships';
 const id='fld_'+'a'.repeat(32),bid='fld_'+'b'.repeat(32),sid='src_'+'c'.repeat(32),graph={sources:{[sid]:{type:'book',title:'Édition 中文',authors:[{literal:'جامعة'}]}},bibliography:{style:'apa7',locale:'fr-FR',includeUncited:true}};
 const citation='<span data-edtr-citation="true" data-field-id="'+id+'" data-citation-items=\'[{"sourceId":"'+sid+'"}]\'>(Édition, 2020)</span>',bib='<p data-bibliography=\'{"fieldId":"'+bid+'"}\'>References</p>';
 const plan=window.adapter.createBibliographyExport(graph,[{fieldId:id,kind:'citation',html:citation},{fieldId:bid,kind:'bibliography',html:bib}]);
 const run=t=>'<w:r><w:t>'+t+'</w:t></w:r>',para=t=>'<w:p>'+run(t)+'</w:p>';
 const zip=new window.JSZip();zip.file('_rels/.rels','<Relationships xmlns="'+p+'"><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="alt/main.xml"/></Relationships>');zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
 zip.file('alt/main.xml','<w:document xmlns:w="'+w+'"><w:body><w:p>'+run(plan.markers[0].start)+'<w:r><w:rPr><w:i/></w:rPr><w:t>(Édition, 2020)</w:t></w:r>'+run(plan.markers[0].end)+'</w:p>'+para(plan.markers[1].start)+para('Rich reference')+para(plan.markers[1].end)+'</w:body></w:document>');
 const blob=await plan.finish(new Blob([await zip.generateAsync({type:'arraybuffer'})])),bytes=await blob.arrayBuffer(),out=await window.JSZip.loadAsync(bytes),native=await out.file('alt/main.xml').async('string');
 const imported=await window.adapter.prepareBibliographyImport(bytes),pre=await window.JSZip.loadAsync(imported.arrayBuffer),prexml=await pre.file('alt/main.xml').async('string'),d=new DOMParser().parseFromString(prexml,'application/xml'),html=[...d.getElementsByTagNameNS(w,'p')].map((el,i)=>'<p>'+(i===0?'user prefix ':'')+el.textContent+(i===0?' user suffix':'')+'</p>').join(''),restored=imported.restore(html);
 const errors={};
 const mutate=async(name,fn)=>{const z=await window.JSZip.loadAsync(bytes);await fn(z);try{await window.adapter.prepareBibliographyImport(await z.generateAsync({type:'arraybuffer'}));errors[name]='ACCEPTED';}catch(e){errors[name]=e.code;}};
 await mutate('visible',async z=>z.file('alt/main.xml',native.replace('(Édition, 2020)','Word edited')));
 await mutate('format',async z=>z.file('alt/main.xml',native.replace('<w:i/>','<w:b/>')));
 await mutate('carrier',async z=>z.file('alt/main.xml',native.replace('EDBC'+id.slice(4),'Other')));
 await mutate('missingEndpoint',async z=>z.file('alt/main.xml',native.replace(/<w:bookmarkEnd[^>]*\/>/,'')));
 await mutate('duplicateIdentity',async z=>z.file('alt/main.xml',native.replace('<w:body>','<w:body><w:p><w:bookmarkStart w:id="999" w:name="EDBC'+id.slice(4)+'"/><w:bookmarkEnd w:id="999"/></w:p>')));
 await mutate('missingPart',async z=>{z.remove('customXml/itemBibliography.xml')});
 await mutate('malformed',async z=>z.file('customXml/itemBibliography.xml','<bad/>'));
 await mutate('relationship',async z=>z.file('alt/_rels/main.xml.rels','<Relationships xmlns="'+p+'"/>'));
 await mutate('nativeField',async z=>z.file('alt/main.xml',native.replace('<w:body>','<w:body><w:p><w:fldSimple w:instr="CITATION tag"/></w:p>')));
 return {graph:imported.graph,expected:graph,restored,native,errors};
 });
 assert.deepEqual(result.graph,result.expected);assert.doesNotMatch(result.native,/<w:sdt/);assert.match(result.native,/<w:i\s*\/>/);assert.match(result.native,/Rich reference/);assert.match(result.restored,/data-edtr-citation/);assert.match(result.restored,/user prefix /);assert.match(result.restored,/ user suffix/);assert.match(result.restored,/data-bibliography/);assert.match(result.restored,/data-edtr-bibliography-import/);assert.equal(Object.keys(result.errors).length,9);for(const [name,value] of Object.entries(result.errors))assert.equal(value,'unsupported-bibliography',name);
 const fixtureGraph=await page.evaluate(async bytes=>{const imported=await window.adapter.prepareBibliographyImport(new Uint8Array(bytes).buffer);return imported.graph},[...fs.readFileSync(path.resolve('fixtures/bibliography/formatted-copy-customxml.docx'))]);
 assert.equal(Object.keys(fixtureGraph.sources).length,1);assert.equal(Object.values(fixtureGraph.sources)[0].authors[0].family,'Lovelace');assert.equal(fixtureGraph.bibliography.style,'apa7');
 const wordSaved=await page.evaluate(async bytes=>{try{await window.adapter.prepareBibliographyImport(new Uint8Array(bytes).buffer);return 'accepted'}catch(error){return error.code}},[...fs.readFileSync(path.resolve('fixtures/bibliography/word-online-edited.docx'))]);assert.equal(wordSaved,'unsupported-bibliography','Word-normalized visible properties must not be overwritten from stale caches');
 console.log('PASS bibliography DOCX: relocated main part, rich native runs/paragraphs, exact graph/IDs/config restoration, and nine corrupt/edit refusal fixtures');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
