/* eslint-disable @typescript-eslint/no-require-imports */
/** Tab inheritance, native preservation and atomic commands with real PM + browser XML. */
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
const entries=Object.fromEntries(Object.entries({tabs:'lib/tab-stops.ts',commands:'lib/tab-commands.ts',format:'lib/paragraph-format.ts',styles:'lib/document-styles.ts',model:'lib/document-model.ts',schema:'app/components/editor-schema.ts',state:'prosemirror-state',history:'prosemirror-history'}).map(([key,file])=>[key,bundle(file.startsWith('lib/')||file.startsWith('app/')?path.join(root,file):require.resolve(file))]));
const script=`window.__tabTests=(()=>{const modules=${JSON.stringify(modules)},cache={};function load(i){if(cache[i])return cache[i].exports;const m={exports:{}};cache[i]=m;new Function('require','module','exports',modules[i].code)(n=>load(modules[i].deps[n]),m,m.exports);return m.exports;}return Object.fromEntries(Object.entries(${JSON.stringify(entries)}).map(([k,i])=>[k,load(i)]));})();`;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage();await page.goto('http://localhost:3107');await page.addScriptTag({content:script});
  const result=await page.evaluate(()=>{
   const {tabs:T,commands:C,format:F,styles:D,model:M,schema:{mySchema:schema},state:S,history:H}=window.__tabTests;
   let checks=0;const check=(value,message)=>{checks++;if(!value)throw new Error(message);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   const stop=(position,alignment='left',leader='none')=>({position,alignment,leader}),W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
   const native=`<w:pPr xmlns:w="${W}"><w:tabs><w:tab w:val="left" w:pos="1440"/><w:tab w:val="right" w:pos="2880" w:leader="hyphen"/><w:tab w:val="bar" w:pos="3600"/><w:tab w:val="decimal" w:pos="4320" w:leader="underscore"/></w:tabs><w:contextualSpacing/></w:pPr>`;
   const parsed=T.parseTabStopsXml(native);check(parsed.stops.length===2&&parsed.unsupported.length===2,'unsupported native kinds and leaders are not coerced');
   check(parsed.stops[1].leader==='dash','native hyphen leader maps to model dash');
   check(T.cleanTabStop(stop(1.5))===null&&T.cleanTabStop(stop(NaN))===null,'fractional and nonfinite positions rejected');
   const merged=T.mergeTabStops([stop(1440),stop(2880)],[stop(1440,'clear'),stop(4320,'right','dot')]);
   check(merged.length===3&&merged[0].alignment==='clear','merge is by position and retains clear tombstones');
   const definitions={Base:{name:'Base',paragraph:{tabs:[stop(1440),stop(2880,'center')]},text:{}},Child:{name:'Child',basedOn:'Base',paragraph:{tabs:[stop(1440,'clear'),stop(4320,'right','dot')]},text:{}}};
   const resolved=D.resolveStyle(definitions,'Child');check(same(resolved.paragraph.tabs,merged.map(s=>s.position===2880?stop(2880,'center'):s)),'style inheritance merges every position');
   const opaqueStyle={...definitions,Opaque:{name:'Opaque',basedOn:'Base',paragraph:{},text:{},rawParagraphProperties:`<w:pPr xmlns:w="${W}"><w:tabs><w:tab w:val="bar" w:pos="1440"/></w:tabs></w:pPr>`}};
   check(!D.resolveStyle(opaqueStyle,'Opaque').paragraph.tabs.some(s=>s.position===1440),'opaque native style stop shadows inherited supported stop');
   const n=schema.nodes.paragraph.create({styleId:'Child',styleParagraph:resolved.paragraph,docxProperties:native,paragraphFormat:{tabs:[stop(1440,'decimal'),stop(2880,'clear')]}},schema.text('CONTENT'));
   check(T.effectiveTabs(n).find(s=>s.position===1440).alignment==='decimal'&&T.effectiveTabs(n).find(s=>s.position===2880).alignment==='clear','direct overrides beat style and native supported stops');
   const xml=F.paragraphXml(n),nativeDoc=new DOMParser().parseFromString(xml,'application/xml'),nativeTabs=Array.from(nativeDoc.getElementsByTagNameNS(W,'tab'));
   check(nativeTabs.some(el=>el.getAttributeNS(W,'val')==='bar'&&el.getAttributeNS(W,'pos')==='3600'),'unknown native kind survives known edits');
   check(nativeTabs.some(el=>el.getAttributeNS(W,'leader')==='underscore'),'unknown native leader survives known edits');
   check(nativeTabs.filter(el=>el.getAttributeNS(W,'pos')==='1440').length===1&&nativeTabs.find(el=>el.getAttributeNS(W,'pos')==='1440').getAttributeNS(W,'val')==='decimal','edited position replaces existing native entry once');
   const dash=schema.nodes.paragraph.create({paragraphFormat:{tabs:[stop(2000,'right','dash')]}},schema.text('DASH'));
   check(F.paragraphXml(dash).includes('leader="hyphen"')&&!F.paragraphXml(dash).includes('leader="dash"'),'native exporter writes valid hyphen enum');
   check(F.paragraphXml(n).includes('contextualSpacing'),'unrelated raw paragraph properties survive tab edits');
   const normalized=D.documentStyles({styles:opaqueStyle});check(normalized.Opaque.rawParagraphProperties===opaqueStyle.Opaque.rawParagraphProperties,'style normalization preserves original pPr XML');
   const make=paras=>{const raw=schema.nodes.doc.create({layout:{width:11906,height:16838,margins:{top:1440,right:1440,bottom:1440,left:1440},styles:definitions}},paras);return S.EditorState.create({doc:M.migrateDocumentNode(raw),plugins:[H.history(),M.documentModelPlugin()]});};
   const apply=(state,tr)=>state.applyTransaction(tr).state;
   const p=(text,tabs,attrs={})=>schema.nodes.paragraph.create({styleId:'Base',styleParagraph:D.resolveStyle(definitions,'Base').paragraph,paragraphFormat:tabs===undefined?{}:{tabs},...attrs},schema.text(text));
   let state=make([p('FIRST',[stop(1440,'right')]),p('SECOND',[stop(1440,'decimal','dot')])]);
   state=apply(state,state.tr.setSelection(S.TextSelection.create(state.doc,1,state.doc.content.size-1)));
   let snapshot=C.readTabStops(state);check(snapshot.mixed&&snapshot.stops===null&&snapshot.paragraphCount===2,'mixed selection does not use first paragraph as shared state');
   check(snapshot.rows.find(row=>row.position===1440).mixed&&snapshot.rows.find(row=>row.position===2880).source==='inherited','rows expose mixed and inherited positions');
   const before=state.doc.toJSON();state=apply(state,C.applyTabChanges(state,{operations:[{type:'upsert',stop:stop(1440,'right','dot')},{type:'remove',position:2880}],documentSettings:{defaultTabStop:900,decimalSeparator:'٫'}}));
   check(state.doc.textContent==='FIRSTSECOND','tab formatting changes no text');
   check(state.doc.child(0).attrs.paragraphFormat.tabs.some(s=>s.position===2880&&s.alignment==='clear')&&state.doc.child(1).attrs.paragraphFormat.tabs.some(s=>s.position===2880&&s.alignment==='clear'),'remove suppresses inherited position on every selected paragraph');
   check(T.documentTabSettings(state.doc.attrs.layout).defaultTabStop===900&&state.doc.attrs.layout.decimalSeparator==='٫','document interval and Arabic decimal policy persist');
   const afterBatch=state.doc.toJSON();let later=apply(state,state.tr.insertText('!',1)),laterUndo;H.undo(later,tr=>{laterUndo=apply(later,tr);});check(same(laterUndo.doc.toJSON(),afterBatch),'immediate typing undo leaves the preceding tab command intact');
   let undone;H.undo(state,tr=>{undone=apply(state,tr);});check(same(undone.doc.toJSON(),before),'one undo restores paragraph stops and document settings');
   let redo;H.redo(undone,tr=>{redo=apply(undone,tr);});state=redo;
   const styleBefore=state.doc.toJSON();state=apply(state,C.applyTabChanges(state,{operations:[{type:'upsert',stop:stop(5760,'decimal')}]},{kind:'style',styleId:'Base'}));
   check(state.doc.child(0).attrs.styleParagraph.tabs.some(s=>s.position===5760)&&state.doc.child(1).attrs.styleParagraph.tabs.some(s=>s.position===5760),'style tab change updates all linked paragraphs');
   check(state.doc.child(0).attrs.paragraphFormat.tabs.find(s=>s.position===1440).leader==='dot','style update preserves direct paragraph stop override');
   let styleUndo;H.undo(state,tr=>{styleUndo=apply(state,tr);});check(same(styleUndo.doc.toJSON(),styleBefore),'style tab batch is one undo transaction');
   state=styleUndo;state=apply(state,C.resetSelectedTabStops(state));check(state.doc.child(0).attrs.paragraphFormat.tabs===undefined&&T.effectiveTabs(state.doc.child(0)).find(s=>s.position===1440).alignment==='left','reset removes managed edits and reveals inherited tabs');
   state=apply(state,C.clearSelectedTabStops(state));check(T.effectiveTabs(state.doc.child(0)).every(s=>s.alignment==='clear'),'clear writes tombstones for all current supported positions');
   const draft=C.readStyleTabStops(definitions,'Child'),draftCopy=JSON.stringify(definitions);
   const draftResult=C.applyTabOperations(draft.baseTabs,draft.directTabs,[{type:'upsert',stop:stop(5000,'decimal')},{type:'remove',position:2880}]);
   check(draftResult.some(s=>s.position===5000)&&draftResult.some(s=>s.position===2880&&s.alignment==='clear')&&JSON.stringify(definitions)===draftCopy,'unsaved style draft operations are pure');
   check(C.applyTabOperations(draft.baseTabs,draft.directTabs,[{type:'reset'}])===undefined,'draft reset can remove override property');
   const markedTab=schema.nodes.tab.create(null,null,[schema.marks.fontSize.create({size:'10pt'})]);let styledAtom=make([schema.nodes.paragraph.create({},[schema.text('A'),markedTab,schema.text('B')])]);
   styledAtom=apply(styledAtom,D.applyDocumentStyle(styledAtom,'Base'));check(styledAtom.doc.firstChild.child(1).marks.some(mark=>mark.type.name==='fontSize'&&mark.attrs.size==='12pt'),'applying a style updates tab atom typography alongside text');
   const unsupported=C.readStyleTabStops(opaqueStyle,'Opaque');check(unsupported.unsupportedCount===1,'unsupported style stop is exposed to UI');
   // Deleting a style must materialize native tabs that have no editable model.
   const rawTabs=(tabs,extra='')=>`<w:pPr xmlns:w="${W}"><w:tabs>${tabs}</w:tabs>${extra}</w:pPr>`;
   const bar=position=>`<w:tab w:pos="${position}" w:val="bar"/>`;
   const deletionStyles={Parent:{name:'Parent',paragraph:{tabs:[stop(720)]},text:{},rawParagraphProperties:rawTabs(bar(1440)+'<w:tab w:val="bar"/>')},
    Child:{name:'Child',basedOn:'Parent',paragraph:{},text:{},rawParagraphProperties:rawTabs(bar(2880),'<w:contextualSpacing/>')},
    ClearedChild:{name:'ClearedChild',basedOn:'Parent',paragraph:{tabs:[stop(1440,'clear')]},text:{},rawParagraphProperties:rawTabs(bar(2880),'<w:shd w:fill="123456"/>')}};
   const removedParagraph=(text,raw,managed)=>schema.nodes.paragraph.create({styleId:'Parent',styleParagraph:D.resolveStyle(deletionStyles,'Parent').paragraph,docxProperties:raw,paragraphFormat:managed?{tabs:managed}:{}},schema.text(text));
   let deletionState=S.EditorState.create({doc:schema.nodes.doc.create({layout:{...state.doc.attrs.layout,styles:deletionStyles}},[
    removedParagraph('Inherited',rawTabs('','<w:shd w:fill="abcdef"/>')),
    removedParagraph('Own supported',rawTabs('<w:tab w:pos="1440" w:val="right"/>','<w:contextualSpacing/>')),
    removedParagraph('Own clear',rawTabs(''),[stop(1440,'clear')])]),plugins:[H.history()]});
   const beforeDeletion=deletionState.doc.toJSON();deletionState=deletionState.apply(D.removeDocumentStyle(deletionState,'Parent'));
   const flattened=deletionState.doc.attrs.layout.styles;
   check(C.readStyleTabStops(flattened,'Child').unsupportedCount===3&&!flattened.Child.basedOn&&flattened.Child.rawParagraphProperties.includes('contextualSpacing'),'deleting parent retains child native tabs, inherited opaque tabs and unrelated raw properties');
   check(!T.parseTabStopsXml(flattened.ClearedChild.rawParagraphProperties).unsupported.some(tab=>tab.position===1440)&&flattened.ClearedChild.rawParagraphProperties.includes('123456'),'child clear masks inherited opaque stop while retaining unrelated properties');
   check(T.parseTabStopsXml(deletionState.doc.child(0).attrs.docxProperties).unsupported.length===2&&deletionState.doc.child(0).attrs.docxProperties.includes('abcdef'),'detached paragraphs retain inherited opaque tabs and own raw properties');
   check(!T.parseTabStopsXml(deletionState.doc.child(1).attrs.docxProperties).unsupported.some(tab=>tab.position===1440)&&T.effectiveTabs(deletionState.doc.child(1)).find(tab=>tab.position===1440).alignment==='right','own supported paragraph tab wins over inherited opaque position');
   check(!T.parseTabStopsXml(deletionState.doc.child(2).attrs.docxProperties).unsupported.some(tab=>tab.position===1440)&&T.effectiveTabs(deletionState.doc.child(2)).find(tab=>tab.position===1440).alignment==='clear','paragraph clear masks inherited opaque position');
   check(T.parseTabStopsXml(F.paragraphXml(deletionState.doc.child(0))).unsupported.length===2,'native paragraph XML retains materialized opaque tabs on export');
   let restoredDeletion;H.undo(deletionState,tr=>{restoredDeletion=deletionState.apply(tr);});check(same(restoredDeletion.doc.toJSON(),beforeDeletion),'one undo restores deleted style and all original raw properties');
   const bad=[{defaultTabStop:0},{defaultTabStop:1.5},{decimalSeparator:';'}];check(bad.every(settings=>{try{C.setDocumentTabSettings(state,settings);return false;}catch{return true;}}),'invalid interval/decimal settings rejected intact');
   // A real tab survives normalization and model v2 protects it from v1 loaders.
   const tabbed=M.parseDocumentHtml('<p>A\tB</p>',schema);check(tabbed.attrs.documentModel.version===5&&tabbed.firstChild.child(1).type.name==='tab'&&tabbed.textContent==='A\tB','model v5 normalizes and retains a literal tab position');
   return{checks};
  });
  assert.ok(result.checks>=28);console.log(`PASS ${result.checks} tab model/command checks: inheritance, clear/reset, mixed paragraphs, style drafts, native preservation/enums, document settings and atomic undo.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
