/* eslint-disable @typescript-eslint/no-require-imports */
/** Real ProseMirror transactions with native browser XML/HTML, isolated from app storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), modules = [];
const cache = new Map();
function bundle(file) {
  if (path.isAbsolute(file) && !path.extname(file) && fs.existsSync(file + '.ts')) file += '.ts';
  file = require.resolve(file); if (cache.has(file)) return cache.get(file);
  const index = modules.length; cache.set(file, index); modules.push(null);
  const input = fs.readFileSync(file, 'utf8');
  const code = file.endsWith('.ts') ? ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText : input;
  const deps = {};
  for (const [, name] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : require.resolve(name, { paths: [path.dirname(file)] });
    deps[name] = bundle(target);
  }
  modules[index] = { code, deps }; return index;
}
const entries = Object.fromEntries(Object.entries({notes:'lib/document-notes.ts',model:'lib/document-model.ts',sections:'lib/document-sections.ts',layout:'lib/document-layout.ts',schema:'app/components/editor-schema.ts',state:'prosemirror-state',history:'prosemirror-history',pm:'prosemirror-model'}).map(([key,file])=>[key,bundle(file.startsWith('lib/')||file.startsWith('app/')?path.join(root,file):require.resolve(file))]));
const script = `window.__notes = (() => { const modules=${JSON.stringify(modules)},loaded={};function load(i){if(loaded[i])return loaded[i].exports;const module={exports:{}};loaded[i]=module;new Function('require','module','exports',modules[i].code)(name=>load(modules[i].deps[name]),module,module.exports);return module.exports;}return Object.fromEntries(Object.entries(${JSON.stringify(entries)}).map(([key,id])=>[key,load(id)]));})();`;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage();await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(()=>{if(!crypto.randomUUID){let counter=1;crypto.randomUUID=()=>`${(counter++).toString(16).padStart(8,'0')}-0000-4000-8000-000000000000`;}});
  await page.addScriptTag({content:script});
  const report=await page.evaluate(()=>{
   const{notes:N,model:M,sections:D,layout:L,schema:{mySchema:schema},state:S,history:H,pm:P}=window.__notes;
   const id=(kind,n)=>`${kind}_${n.toString(16).padStart(32,'0')}`, noteId=id('nte',1), noteId2=id('nte',2), checks=[];
   const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);}, same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   const reject=(html,message)=>{let error;try{M.parseDocumentHtml(html,schema);}catch(e){error=e;}check(error?.code==='invalid-model',message);};
   const htmlOf=doc=>{const host=document.createElement('div');host.appendChild(P.DOMSerializer.fromSchema(schema).serializeFragment(doc.content));return L.wrapDocumentHtml(host.innerHTML,doc.attrs.layout,doc.attrs.documentModel);};
   const clone=value=>JSON.parse(JSON.stringify(value)), p=(text,attrs)=>schema.nodes.paragraph.create(attrs,typeof text==='string'?schema.text(text):text), body=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
   const legacy=M.parseDocumentHtml('<h1>Stable heading</h1><p>Legacy body</p>',schema), legacyModel=M.getDocumentModel(legacy);
   check(legacyModel.version===5&&Object.keys(legacyModel.notes).length===0,'v0 migrates to v5 empty note pool');
   for(const version of [1,2,3,4]){
    const old=clone(legacyModel);old.version=version;delete old.notes;delete old.notePolicy;if(version<3)for(const section of Object.values(old.sections)){delete section.columns;delete section.flowDirection;}
    const source=legacy.type.create({...legacy.attrs,documentModel:old},legacy.content), migrated=M.parseDocumentHtml(htmlOf(source),schema), current=M.getDocumentModel(migrated);
    check(current.version===5&&current.id===old.id&&current.finalSectionId===old.finalSectionId&&same(Object.keys(current.sections),Object.keys(old.sections)),`v${version} migration preserves document/section identities`);
    check(migrated.firstChild.attrs.targetId===legacy.firstChild.attrs.targetId,`v${version} migration preserves A4 target identity`);
    check(htmlOf(M.parseDocumentHtml(htmlOf(migrated),schema))===htmlOf(migrated),`v${version} migration is HTML idempotent`);
   }
   const record={kind:'endnote',body:body('Canonical note')}, model={...legacyModel,notes:{[noteId]:record}}, owner=schema.nodes.note_reference.create({noteId,cachedLabel:'999'}), noteDoc=legacy.type.create({...legacy.attrs,documentModel:model},[p([schema.text('Owner '),owner]),p('Tail')]);
   const opened=M.parseDocumentHtml(htmlOf(noteDoc),schema);check(N.collectNoteIndex(opened).notes[0].noteId===noteId,'v5 save/open preserves note owner identity');check(opened.attrs.documentModel.notes[noteId].body.content[0].content[0].text==='Canonical note','v5 save/open preserves canonical body');
   check(opened.firstChild.lastChild.attrs.cachedLabel==='1','load refreshes stale note label cache');
   check(opened.lastChild.attrs.noteOwnerId===noteId&&opened.lastChild.textContent==='1 Canonical note','load generates ordinary endnote projection from canonical pool');
   check(htmlOf(M.parseDocumentHtml(htmlOf(opened),schema))===htmlOf(opened),'v5 projected HTML reopens idempotently');
   const firstSection=legacyModel.finalSectionId, secondSection=id('sec',99), listBody={type:'doc',content:[{type:'ordered_list',attrs:{order:3},content:[{type:'list_item',content:[{type:'paragraph',content:[{type:'text',text:'LIST_TERMINAL_NOTE'}]}]}]}]}, sectionPolicy=N.defaultNotePolicy();sectionPolicy.endnote.placement='sectionEnd';
   const sectionModel={...model,finalSectionId:secondSection,sections:{...model.sections,[secondSection]:clone(model.sections[firstSection])},notes:{[noteId]:{kind:'endnote',body:listBody}},notePolicy:sectionPolicy};
   const sectionSource=legacy.type.create({...legacy.attrs,documentModel:sectionModel},[p([schema.text('Section owner '),owner],{sectionEndId:firstSection}),p('FOLLOWING_SECTION_BODY')]);
   const sectionOpened=M.parseDocumentHtml(htmlOf(sectionSource),schema), projectedList=sectionOpened.child(1);
   check(projectedList.type.name==='ordered_list'&&projectedList.attrs.order===3&&projectedList.textContent==='1 LIST_TERMINAL_NOTE','actual schema projects list-first note preserving list order and prefix number');
   check(sectionOpened.firstChild.attrs.sectionEndId===null&&projectedList.attrs.sectionEndId===firstSection&&D.documentSections(sectionOpened).length===2,'actual migration moves section terminal to final projected list wrapper');
   check(sectionOpened.lastChild.textContent==='FOLLOWING_SECTION_BODY'&&sectionOpened.lastChild.attrs.noteOwnerId===null,'section endnotes stay before following canonical section');
   check(htmlOf(M.parseDocumentHtml(htmlOf(sectionOpened),schema))===htmlOf(sectionOpened),'section/list projected boundary is HTML idempotent');
   const stripped=N.unprojectEndnotes(S.EditorState.create({doc:sectionOpened}).tr);M.projectDocumentModel(stripped,M.getDocumentModel(stripped.doc));check(stripped.doc.firstChild.attrs.sectionEndId===firstSection&&stripped.doc.childCount===2,'actual list projection unprojects atomically to original canonical boundary');
   const bad=clone(opened.toJSON());bad.attrs.documentModel.notes[noteId2]={kind:'endnote',body:body('Orphan')};reject(htmlOf(schema.nodeFromJSON(bad)),'orphan pool record rejects full load');
   const missing=clone(opened.toJSON());delete missing.attrs.documentModel.notes[noteId];reject(htmlOf(schema.nodeFromJSON(missing)),'missing body rejects full load');
   const duplicate=clone(opened.toJSON());duplicate.content[0].content.push({type:'note_reference',attrs:{noteId,cachedLabel:'1'}});reject(htmlOf(schema.nodeFromJSON(duplicate)),'duplicate owner rejects full load');
   const malformed=clone(opened.toJSON());malformed.attrs.documentModel.notes[noteId].body={type:'doc',content:[{type:'paragraph',attrs:{sectionEndId:legacyModel.finalSectionId}}]};reject(htmlOf(schema.nodeFromJSON(malformed)),'body section boundary rejects full load');
   const stale=clone(opened.toJSON());stale.content[stale.content.length-1].content=[{type:'text',text:'STALE CACHE'}];const refreshed=M.parseDocumentHtml(htmlOf(schema.nodeFromJSON(stale)),schema);check(refreshed.lastChild.textContent==='1 Canonical note','load regenerates stale generated text without overwriting pool');
   const marker=clone(opened.toJSON());marker.content[marker.content.length-1].attrs.noteBlock=-1;reject(htmlOf(schema.nodeFromJSON(marker)),'malformed generated marker rejects full load');
   const wrongCache=clone(opened.toJSON());wrongCache.content[wrongCache.content.length-1].attrs.noteOwnerId=noteId2;reject(htmlOf(schema.nodeFromJSON(wrongCache)),'unknown generated note cache identity rejects full load');
   const imported={notes:{[noteId]:record},notePolicy:N.defaultNotePolicy(),sectionNotePolicies:[]}, carrier=document.createElement('div');carrier.setAttribute('data-edtr-notes-import',JSON.stringify(imported));carrier.innerHTML=`<p>Native owner <span data-edtr-note-reference='true' data-note-id='${noteId}'>1</span></p>`;
   const importedDoc=M.parseDocumentHtml(carrier.outerHTML,schema);check(N.collectNoteIndex(importedDoc).notes.length===1,'native note import metadata merges at common migration gate');
   reject(carrier.outerHTML+carrier.outerHTML,'duplicate native metadata carrier rejects full load');
   const wrongSections=clone(imported);wrongSections.sectionNotePolicies=[{},{}];carrier.setAttribute('data-edtr-notes-import',JSON.stringify(wrongSections));reject(carrier.outerHTML,'native section policy count mismatch rejects full load');
   carrier.setAttribute('data-edtr-notes-import','{broken');reject(carrier.outerHTML,'malformed native JSON rejects full load');
   const future=clone(legacyModel);future.version=6;let futureError;try{M.parseDocumentHtml(L.wrapDocumentHtml('<p>FUTURE SOURCE</p>',legacy.attrs.layout,future),schema);}catch(e){futureError=e;}check(futureError?.code==='unsupported-version','future version rejects before schema drops model');
   let state=S.EditorState.create({doc:opened,plugins:[H.history(),M.documentModelPlugin(),N.notePlugin({finalize:tr=>M.projectDocumentModel(tr,M.getDocumentModel(tr.doc))})]});
   N.updateNoteBody(noteId,body('Edited note'))(state,tr=>state=state.applyTransaction(tr).state);check(state.doc.lastChild.textContent==='1 Edited note','real model+note plugins update canonical pool and generated flow');
   H.undo(state,tr=>state=state.applyTransaction(tr).state);check(state.doc.lastChild.textContent==='1 Canonical note','real model+note undo restores generated content and pool');
   const restored=M.parseDocumentHtml(htmlOf(opened),schema);check(restored.attrs.documentModel.notes[noteId].body.content[0].content[0].text==='Canonical note','full version HTML restore retains original note graph');
   return{checks:checks.length,details:checks};
  });
  assert.ok(report.checks>=30);console.log(`PASS ${report.checks} native browser v5 migration/load/projection/undo checks`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
