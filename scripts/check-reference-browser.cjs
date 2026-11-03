/* eslint-disable @typescript-eslint/no-require-imports */
/** Real DOM migration, HTML roundtrip and clipboard-provenance integration. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),modules=[],cache=new Map();
function bundle(file){
 if(path.isAbsolute(file)&&!path.extname(file)&&fs.existsSync(file+'.ts'))file+='.ts';
 file=require.resolve(file);if(cache.has(file))return cache.get(file);const i=modules.length;cache.set(file,i);modules.push(null);
 const input=fs.readFileSync(file,'utf8'),code=file.endsWith('.ts')?ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText:input,deps={};
 for(const[,name]of code.matchAll(/require\(["']([^"']+)["']\)/g))deps[name]=bundle(name.startsWith('@/')?path.join(root,name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(file),name):require.resolve(name,{paths:[path.dirname(file)]}));
 modules[i]={code,deps};return i;
}
const entries=Object.fromEntries(Object.entries({refs:'lib/document-references.ts',model:'lib/document-model.ts',schema:'app/components/editor-schema.ts',state:'prosemirror-state',history:'prosemirror-history',view:'prosemirror-view',pm:'prosemirror-model'}).map(([key,file])=>[key,bundle(file.startsWith('lib/')||file.startsWith('app/')?path.join(root,file):require.resolve(file))]));
const script=`window.__referenceTests=(()=>{const modules=${JSON.stringify(modules)},cache={};function load(i){if(cache[i])return cache[i].exports;const m={exports:{}};cache[i]=m;new Function('require','module','exports',modules[i].code)(n=>load(modules[i].deps[n]),m,m.exports);return m.exports;}return Object.fromEntries(Object.entries(${JSON.stringify(entries)}).map(([k,i])=>[k,load(i)]));})();`;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  const page=await browser.newPage(); await page.goto(process.env.BASE_URL||'http://localhost:3107'); await page.addScriptTag({content:script});
  const result=await page.evaluate(()=>{
   const {refs:R,model:M,schema:{mySchema:schema},state:S,history:H,view:V,pm:P}=window.__referenceTests;
   let checks=0;const check=(v,message)=>{checks++;if(!v)throw Error(message);};
   const id=(kind,n)=>kind+'_'+n.toString(16).padStart(32,'0'),h=(text,targetId=id('tgt',1))=>schema.nodes.heading.create({targetId},schema.text(text)),p=(content,attrs={})=>schema.nodes.paragraph.create(attrs,typeof content==='string'?schema.text(content):content),f=(targetId,fieldId=id('fld',1),extra={})=>schema.nodes.reference_field.create({targetId,fieldId,...extra});
   const source=schema.nodes.doc.create(null,[h('Stable heading'),p([f(id('tgt',1))]),p([schema.nodes.bookmark_start.create({targetId:id('tgt',3),name:'Bookmarked',nativeName:'NativeBook'}),schema.text('Bookmark text'),schema.nodes.bookmark_end.create({targetId:id('tgt',3)})])]),migrated=M.migrateDocumentNode(source);
   check(migrated.attrs.documentModel.version===4,'legacy HTML migrates directly to v4');
   const serialize=doc=>{const el=document.createElement('div');el.setAttribute('data-edtr-model',JSON.stringify(doc.attrs.documentModel));el.setAttribute('data-edtr-layout',JSON.stringify(doc.attrs.layout));el.appendChild(P.DOMSerializer.fromSchema(schema).serializeFragment(doc.content));return el.outerHTML;};
   const reopened=M.parseDocumentHtml(serialize(migrated),schema);check(JSON.stringify(reopened.attrs.documentModel)===JSON.stringify(migrated.attrs.documentModel)&&JSON.stringify(R.collectReferenceIndex(reopened).targets)===JSON.stringify(R.collectReferenceIndex(migrated).targets)&&reopened.child(1).firstChild.eq(migrated.child(1).firstChild),'full HTML save/reopen preserves target,field,doc and section IDs');
   const oldModel={...migrated.attrs.documentModel,version:3};oldModel.sections[oldModel.finalSectionId]={...oldModel.sections[oldModel.finalSectionId],columns:{kind:'equal',count:2,space:777,separator:true}};
   const legacy=schema.nodes.doc.create({...migrated.attrs,documentModel:oldModel},migrated.content),v4=M.migrateDocumentNode(legacy);check(v4.attrs.documentModel.id===oldModel.id&&v4.attrs.documentModel.sections[oldModel.finalSectionId].columns.space===777,'v3 migration preserves identities and direct A3 column settings');
   let future=false;try{M.parseDocumentHtml(serialize(v4).replace('&quot;version&quot;:4','&quot;version&quot;:5'),schema);}catch(error){future=error.code==='unsupported-version';}check(future,'future envelope blocked before schema parsing');
   const native=schema.nodes.doc.create({...migrated.attrs},[p([f(null,id('fld',7),{status:'unsupported',instruction:' REF native \\x ',nativeXml:'<w:fldSimple w:instr="REF native"/>',cached:'Preserved'})],{toc:{fieldId:id('fld',8),levels:[1],status:'unsupported',nativeSource:'<nativeTOC/>'}})]);
   const nativeReopen=M.parseDocumentHtml(serialize(native),schema);check(nativeReopen.firstChild.firstChild.attrs.nativeXml===native.firstChild.firstChild.attrs.nativeXml&&nativeReopen.firstChild.attrs.toc.nativeSource==='<nativeTOC/>','unsupported native field/TOC source survives HTML');
   const host=document.createElement('div');document.body.appendChild(host);
   const make=(nodes,extra=[])=>new V.EditorView(host.appendChild(document.createElement('div')),{state:S.EditorState.create({doc:M.migrateDocumentNode(schema.nodes.doc.create(null,nodes)),plugins:[H.history(),M.documentModelPlugin(),R.referenceIdentityPlugin(),...extra]})});
   let view=make([h('Inside'),p([f(id('tgt',1)),f(id('tgt',2),id('fld',2))]),h('Outside',id('tgt',2)),p('Destination')]);
   const select=(from,to)=>view.dispatch(view.state.tr.setSelection(S.TextSelection.create(view.state.doc,from,to))), paste=data=>view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})),copy=(kind='copy')=>{const data=new DataTransfer();view.dom.dispatchEvent(new ClipboardEvent(kind,{clipboardData:data,bubbles:true,cancelable:true}));return data;};
   const end=view.state.doc.child(0).nodeSize+view.state.doc.child(1).nodeSize;select(0,end);const clipboard=copy();check(clipboard.getData('application/x-edtr-reference-token').length>0,'actual copy creates opaque local provenance');
   select(view.state.doc.content.size-1,view.state.doc.content.size-1);paste(clipboard);
   let index=R.collectReferenceIndex(view.state.doc);const inside=index.targets.filter(t=>t.text==='Inside');check(inside.length===2&&inside[0].id!==inside[1].id,'actual HTML parse/paste clones target');
   const copiedFields=index.fields.slice(-2);check(copiedFields[0].node.attrs.targetId===inside[1].id,'actual paste remaps internal target');check(copiedFields[1].node.attrs.targetId===id('tgt',2),'actual paste preserves trusted external target after section transform');
   const other=make([h('Other with colliding id',id('tgt',2)),p('Destination')]);other.dispatch(other.state.tr.setSelection(S.TextSelection.create(other.state.doc,other.state.doc.content.size-1)));other.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));
   const foreign=R.collectReferenceIndex(other.state.doc);check(foreign.fields[1].node.attrs.targetId===null&&foreign.fields[1].node.attrs.status==='missing-target','another open editor cannot trust source-document HTML/token');
   view.dispatch(view.state.tr.setMeta('documentLoad',true));select(view.state.doc.content.size-1);paste(clipboard);const reopenedPaste=R.collectReferenceIndex(view.state.doc).fields.slice(-2);check(reopenedPaste[1].node.attrs.targetId===null,'document load invalidates clipboard token even for the same model ID');
   const unknown=document.createElement('div');unknown.innerHTML='<p><span data-edtr-reference="true" data-field-id="'+id('fld',44)+'" data-target-id="'+id('tgt',1)+'" data-display="future-format" data-status="ok">cached</span></p>';
   const unknownField=P.DOMParser.fromSchema(schema).parse(unknown).firstChild.firstChild;check(unknownField.attrs.display==='future-format'&&unknownField.attrs.status==='unsupported','unknown display stays preserved and unsupported');
   view.destroy();other.destroy();host.remove();
   view=make([h('Move'),p([f(id('tgt',1))]),p('Destination')]);select(0,view.state.doc.child(0).nodeSize+view.state.doc.child(1).nodeSize);const cut=copy('cut');check(!R.collectReferenceIndex(view.state.doc).targets.length,'cut removes original definitions');select(view.state.doc.content.size-1);paste(cut);
   index=R.collectReferenceIndex(view.state.doc);check(index.targets[0].id===id('tgt',1)&&index.fields[0].node.attrs.fieldId===id('fld',1),'verified same-session cut restores original target/field identities');
   H.undo(view.state,tr=>view.dispatch(tr));check(!R.collectReferenceIndex(view.state.doc).targets.length,'one undo reverses only paste');select(view.state.doc.content.size-1);paste(cut);index=R.collectReferenceIndex(view.state.doc);check(index.targets[0].id!==id('tgt',1),'cut transfer cannot be reused even after undo');
   view.destroy();host.remove();
   let rejectPaste=true;view=make([h('Rejected paste retry'),p([f(id('tgt',1))]),p('Destination')],[new S.Plugin({filterTransaction:tr=>!tr.getMeta('paste')||!rejectPaste})]);
   select(0,view.state.doc.child(0).nodeSize+view.state.doc.child(1).nodeSize);const retryCut=copy('cut');select(view.state.doc.content.size-1);paste(retryCut);check(!R.collectReferenceIndex(view.state.doc).targets.length,'blocked paste leaves cut content absent and token available');rejectPaste=false;paste(retryCut);check(R.collectReferenceIndex(view.state.doc).targets[0].id===id('tgt',1),'rejected paste does not consume a safe cut token');view.destroy();host.remove();
   const bookId=id('tgt',21), bs=schema.nodes.bookmark_start.create({targetId:bookId,name:'Partial'}), be=schema.nodes.bookmark_end.create({targetId:bookId});
   view=make([p([bs,schema.text('abc'),be]),p([f(bookId,id('fld',22))]),p('Destination')]);
   let endPos=-1;view.state.doc.descendants((node,pos)=>{if(node.type.name==='bookmark_end')endPos=pos;});select(endPos,endPos+1);const partial=copy();select(view.state.doc.content.size-1);paste(partial);
   index=R.collectReferenceIndex(view.state.doc);check(R.lookupReferenceTarget(index,bookId).status==='ok'&&index.fields[0].node.attrs.targetId===bookId,'actual copied end cannot invalidate original bookmark');view.destroy();host.remove();
   view=make([h('Drag heading'),p([f(id('tgt',1))]),p('Drop destination')]);
   select(0,view.state.doc.firstChild.nodeSize);const transfer=new DataTransfer(), origin=view.coordsAtPos(1), dest=view.coordsAtPos(view.state.doc.content.size-1);
   view.dom.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:origin.left,clientY:origin.top,ctrlKey:true,altKey:true}));
   check(!!view.dragging,'native dragstart registered internal source');
   view.dom.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:dest.left,clientY:dest.top,ctrlKey:true,altKey:true}));
   index=R.collectReferenceIndex(view.state.doc);const copies=index.targets.filter(target=>target.text==='Drag heading');
   check(copies.length===2&&copies[0].id!==copies[1].id&&index.fields[0].node.attrs.targetId===id('tgt',1),'native modifier drag clones heading without invalidating existing references');H.undo(view.state,tr=>view.dispatch(tr));index=R.collectReferenceIndex(view.state.doc);check(index.targets.filter(target=>target.text==='Drag heading').length===1&&index.fields[0].node.attrs.targetId===id('tgt',1),'undo reverses drag copy without altering original binding');view.destroy();host.remove();
   view=make([h('Keyboard target'),p([f(id('tgt',1))])]);const fieldElement=view.dom.querySelector('[data-edtr-reference]');fieldElement.focus();fieldElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));check(view.state.selection.from===1,'focused reference Enter navigates to target');
   const fieldPos=R.collectReferenceIndex(view.state.doc).fields[0].pos;view.dispatch(view.state.tr.setSelection(S.NodeSelection.create(view.state.doc,fieldPos)));view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));check(view.state.selection.from===1,'selected reference Enter navigates without editing the atom');view.destroy();host.remove();
   return {checks};
  });
  console.log(JSON.stringify(result));assert.ok(result.checks>=15);
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
