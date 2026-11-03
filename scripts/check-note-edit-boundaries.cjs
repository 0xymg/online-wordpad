/* eslint-disable @typescript-eslint/no-require-imports */
/** Real ProseMirror transactions with native browser XML/HTML, isolated from app storage. */
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
const entries = Object.fromEntries(Object.entries({commands:'prosemirror-commands',sectionCommands:'lib/section-commands.ts',notes:'lib/document-notes.ts',model:'lib/document-model.ts',sections:'lib/document-sections.ts',layout:'lib/document-layout.ts',schema:'app/components/editor-schema.ts',state:'prosemirror-state',history:'prosemirror-history',pm:'prosemirror-model'}).map(([key,file])=>[key,bundle(file.startsWith('lib/')||file.startsWith('app/')?path.join(root,file):require.resolve(file))]));
const script = `window.__notes = (() => { const modules=${JSON.stringify(modules)},loaded={};function load(i){if(loaded[i])return loaded[i].exports;const module={exports:{}};loaded[i]=module;new Function('require','module','exports',modules[i].code)(name=>load(modules[i].deps[name]),module,module.exports);return module.exports;}return Object.fromEntries(Object.entries(${JSON.stringify(entries)}).map(([key,id])=>[key,load(id)]));})();`;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage();await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(()=>{if(!crypto.randomUUID){let counter=1;crypto.randomUUID=()=>`${(counter++).toString(16).padStart(8,'0')}-0000-4000-8000-000000000000`;}});
  await page.addScriptTag({content:script});
  const report=await page.evaluate(()=>{
   const{notes:N,model:M,schema:{mySchema:schema},state:S,history:H,pm:P,commands:C,sectionCommands:SC}=window.__notes;
   const checks=[],check=(value,message)=>{if(!value)throw Error(message);checks.push(message);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),p=(text,attrs)=>schema.nodes.paragraph.create(attrs,typeof text==='string'?schema.text(text):text);
   for(const kind of ['paragraph','ordered_list']){
    const base=M.parseDocumentHtml('<p>ANCHOR</p><p>TAIL_KEEP</p>',schema),model=base.attrs.documentModel,one=model.finalSectionId,two='sec_'+ '2'.repeat(32),id='nte_'+ 'a'.repeat(32),policy=N.defaultNotePolicy();policy.endnote.placement='sectionEnd';
    const paragraph={type:'paragraph',content:[{type:'text',text:'NOTE_BODY'}]},noteBody={type:'doc',content:[kind==='paragraph'?paragraph:{type:'ordered_list',attrs:{order:3},content:[{type:'list_item',content:[paragraph]}]}]},full={...model,finalSectionId:two,sections:{...model.sections,[two]:structuredClone(model.sections[one])},notes:{[id]:{kind:'endnote',body:noteBody}},notePolicy:policy};
    const doc=M.migrateDocumentNode(base.type.create({...base.attrs,documentModel:full},[p([schema.text('ANCHOR'),schema.nodes.note_reference.create({noteId:id})],{sectionEndId:one}),p('TAIL_KEEP')])),initial=doc.toJSON(),blocked=[];
    const make=()=>S.EditorState.create({doc,plugins:[H.history(),M.documentModelPlugin(),N.notePlugin({finalize:tr=>M.projectDocumentModel(tr,M.getDocumentModel(tr.doc)),onBlocked:error=>blocked.push(error.code)})]}),apply=(state,tr)=>state.applyTransaction(tr).state,generatedStart=doc.firstChild.nodeSize,lastStart=generatedStart+doc.child(1).nodeSize;
    let state=make();state=apply(state,state.tr.setSelection(S.TextSelection.create(doc,lastStart+1)));C.joinBackward(state,tr=>state=apply(state,tr));check(same(state.doc.toJSON(),initial),kind+': Backspace at following source start cannot swallow source into generated cache');
    state=make();state=apply(state,state.tr.setSelection(S.TextSelection.create(doc,doc.firstChild.nodeSize-1)));C.joinForward(state,tr=>state=apply(state,tr));check(same(state.doc.toJSON(),initial),kind+': Delete before generated block cannot leak cached text into source or merge sections');
    state=make();const cachedTextStart=generatedStart+(kind==='paragraph'?1:3);const partialTr=state.tr.setSelection(S.TextSelection.create(doc,2,cachedTextStart+3)).insertText('X');state=apply(state,partialTr);check(same(state.doc.toJSON(),initial),kind+': partial source-to-cache replace is blocked atomically '+JSON.stringify({steps:partialTr.steps.map(step=>step.toJSON()),text:state.doc.textContent}));
    state=make();state=apply(state,state.tr.setSelection(S.TextSelection.create(doc,generatedStart,lastStart)).insertText('X'));check(same(state.doc.toJSON(),initial),kind+': cache-only whole-block replacement cannot create canonical copy');
    state=make();state=apply(state,state.tr.setSelection(S.TextSelection.create(doc,2,lastStart+3)).insertText('X'));check(state.doc.textContent==='AXIL_KEEP'&&Object.keys(state.doc.attrs.documentModel.notes).length===0,kind+': complete cache plus source range replace keeps only intended canonical text');H.undo(state,tr=>state=apply(state,tr));check(same(state.doc.toJSON(),initial),kind+': full range replace undo restores exact graph and section boundaries');
    state=make();state=apply(state,state.tr.setSelection(new S.AllSelection(doc)).deleteSelection());check(state.doc.textContent===''&&Object.keys(state.doc.attrs.documentModel.notes).length===0,kind+': AllSelection Delete remains allowed');H.undo(state,tr=>state=apply(state,tr));check(same(state.doc.toJSON(),initial),kind+': AllSelection delete undo restores exact pool/source/cache/section graph');
    for(const keep of ['keepBefore','keepAfter']){state=make();state=apply(state,SC.removeDocumentSectionBoundary(state,one,keep));check(Object.keys(state.doc.attrs.documentModel.sections).length===1&&state.doc.textContent.includes('TAIL_KEEP'),kind+': '+keep+' section merge remains allowed');H.undo(state,tr=>state=apply(state,tr));check(same(state.doc.toJSON(),initial),kind+': '+keep+' undo restores graph '+JSON.stringify({afterSections:Object.keys(state.doc.attrs.documentModel.sections),beforeSections:Object.keys(initial.attrs.documentModel.sections)}));}
    state=make();const beforeNormalization=blocked.length,normalized=doc.type.create(doc.attrs,P.Fragment.fromArray(Array.from({length:doc.childCount},(_,i)=>{const markAll=node=>node.isText?node.mark(node.marks.concat(schema.marks.textColor.create({color:'rgb(0, 0, 0)'}))):node.copy(P.Fragment.fromArray(Array.from({length:node.childCount},(_,j)=>markAll(node.child(j)))));return markAll(doc.child(i));})));state=apply(state,state.tr.replaceWith(0,doc.content.size,normalized.content));check(same(state.doc.toJSON(),initial)&&blocked.length===beforeNormalization,kind+': inherited-mark DOM normalization is rejected silently without mutating canonical pool');
    check(blocked.length>=3,kind+': rejected cache edits publish localized error');
   }
   return{checks:checks.length};
  });console.log(`PASS ${report.checks} focused generated/source join, partial/full range replace, AllSelection and section-merge undo checks`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
