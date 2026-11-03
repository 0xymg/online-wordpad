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
const entries = Object.fromEntries(Object.entries({ columnBreak: 'lib/column-break.ts', sectionColumns: 'lib/section-columns.ts', model: 'lib/document-model.ts', commands: 'lib/section-commands.ts', sections: 'lib/document-sections.ts', layout: 'lib/document-layout.ts', schema: 'app/components/editor-schema.ts', state: 'prosemirror-state', history: 'prosemirror-history', pm: 'prosemirror-model', list: 'prosemirror-schema-list' }).map(([key, file]) => [key, bundle(file.startsWith('lib/') || file.startsWith('app/') ? path.join(root, file) : require.resolve(file))]));
const script = `window.__sections = (() => { const modules=${JSON.stringify(modules)},loaded={};function load(i){if(loaded[i])return loaded[i].exports;const module={exports:{}};loaded[i]=module;new Function('require','module','exports',modules[i].code)(name=>load(modules[i].deps[name]),module,module.exports);return module.exports;}return Object.fromEntries(Object.entries(${JSON.stringify(entries)}).map(([key,id])=>[key,load(id)]));})();`;
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage(); await page.goto('http://localhost:3107'); await page.addScriptTag({ content: script });
    const result = await page.evaluate(() => {
      const { columnBreak: B, sectionColumns: SC, model: M, commands: C, sections: D, layout: L, schema: { mySchema: schema }, state: S, history: H, pm: P, list } = window.__sections;
      let checks = 0; const check = (condition, message) => { checks++; if (!condition) throw new Error(message); };
      const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
      const create = html => S.EditorState.create({ doc: M.parseDocumentHtml(html, schema), plugins: [H.history(), M.documentModelPlugin()] });
      const apply = (state,tr) => state.applyTransaction(tr).state;
      const withCursor = (state,pos) => apply(state,state.tr.setSelection(S.TextSelection.create(state.doc,pos)));
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const raw = `<w:pPr xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:sectPr><w:headerReference w:type="default" r:id="EDTRSource_h1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:pgNumType w:start="3" w:fmt="decimal" w:chapStyle="1"/></w:sectPr></w:pPr>`;
      const legacyLayout = { ...L.defaultDocumentLayout(), sectionMargins: { 0: { top: 720, right: 900, bottom: 1080, left: 1260 } }, running: { '0:default:header': { html: '<p>HEADER ZERO</p>', linked: false, distance: 200, height: 100 } } };
      const source = L.wrapDocumentHtml(`<p data-docx-properties="${raw.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">ALPHA BETA</p><p>GAMMA DELTA</p>`, legacyLayout);
      let state = create(source), sections = D.documentSections(state.doc), originalId = sections[0].id, lastId = sections[1].id;
      check(sections.length === 2 && originalId !== lastId, 'legacy sections migrate to unique IDs');
      check(M.getDocumentModel(state.doc).sections[originalId].page.margins.left === 1260, 'indexed margins bind to original stable ID');
      check(M.getDocumentModel(state.doc).sections[originalId].running['default:header'].html.includes('HEADER ZERO'), 'indexed header binds to original stable ID');
      const encoded = L.wrapDocumentHtml(P.DOMSerializer.fromSchema(schema).serializeFragment(state.doc.content).textContent, state.doc.attrs.layout, state.doc.attrs.documentModel);
      const output = document.createElement('div'); output.appendChild(P.DOMSerializer.fromSchema(schema).serializeFragment(state.doc.content));
      const html = L.wrapDocumentHtml(output.innerHTML,state.doc.attrs.layout,state.doc.attrs.documentModel), reopened = M.parseDocumentHtml(html,schema);
      check(same(reopened.toJSON(), state.doc.toJSON()), 'save/reopen is idempotent and preserves identity');
      check(encoded.includes('data-edtr-model'), 'model envelope serializes');
      const oldVersion=JSON.parse(JSON.stringify(M.getDocumentModel(reopened)));oldVersion.version=1;
      const upgraded=M.parseDocumentHtml(L.wrapDocumentHtml(output.innerHTML,reopened.attrs.layout,oldVersion),schema);
      check(upgraded.attrs.documentModel.version===3 && upgraded.attrs.documentModel.id===oldVersion.id && same(D.documentSections(upgraded).map(s=>s.id),D.documentSections(reopened).map(s=>s.id)),'v1 upgrades to v3 without changing document or section identities');
      const columnRaw = `<w:sectPr xmlns:w="${W}" xmlns:x="urn:test"><w:cols w:num="2" w:equalWidth="1" x:custom="retain"/><w:bidi/><w:docGrid w:linePitch="360"/></w:sectPr>`;
      const baseline = JSON.parse(JSON.stringify(M.getDocumentModel(reopened)));
      const columnId = baseline.finalSectionId;
      baseline.sections[columnId].rawProperties = columnRaw;
      for (const version of [1,2]) {
        const old = JSON.parse(JSON.stringify(baseline)); old.version = version;
        for (const record of Object.values(old.sections)) { delete record.columns; delete record.flowDirection; }
        const migrated = M.parseDocumentHtml(L.wrapDocumentHtml(output.innerHTML,reopened.attrs.layout,old),schema);
        const record = M.getDocumentModel(migrated).sections[columnId];
        check(record.columns.kind==='equal' && record.columns.count===2 && record.columns.space===720 && record.flowDirection==='rtl' && migrated.attrs.documentModel.id===old.id, `v${version} derives native columns and bidi with IDs stable`);
        check(M.sectionRecordXml(record).includes('custom="retain"') && M.sectionRecordXml(record).includes('linePitch="360"'), 'unknown native properties survive projection');
      }
      const current = M.getDocumentModel(reopened), targets = D.documentSections(reopened).map(x=>x.id);
      let columnsState = S.EditorState.create({doc:reopened,plugins:[H.history(), M.documentModelPlugin()]});
      const beforeColumns = columnsState.doc.toJSON();
      columnsState=apply(columnsState,C.setSectionLayout(columnsState,{columns:{kind:'equal',count:2,space:0,separator:true},flowDirection:'rtl'},'all',targets[0]));
      check(D.documentSections(columnsState.doc).every(x=>x.columns.kind==='equal'&&x.columns.space===0&&x.columns.separator&&x.flowDirection==='rtl'),'all-section command applies zero gap and direction');
      let columnUndo; H.undo(columnsState,tr=>{columnUndo=apply(columnsState,tr)});check(same(columnUndo.doc.toJSON(),beforeColumns),'one undo restores all columns and direction');
      let badGeometry=false;try{C.setSectionLayout(columnsState,{columns:{kind:'equal',count:3,space:100000,separator:false}},'all',targets[0])}catch(e){badGeometry=e.code==='invalid-geometry'}check(badGeometry,'invalid geometry rejected atomically');
      const unsupported = JSON.parse(JSON.stringify(current));unsupported.sections[columnId].rawProperties=columnRaw.replace('w:equalWidth="1"','w:equalWidth="0"');unsupported.version=2;
      const preservedDoc=M.parseDocumentHtml(L.wrapDocumentHtml(output.innerHTML,reopened.attrs.layout,unsupported),schema), preserved=M.getDocumentModel(preservedDoc).sections[columnId];
      check(preserved.columns.kind==='preserved' && M.sectionRecordXml(preserved).includes('equalWidth="0"'),'unequal native columns remain preserved');
      let conversion=false;try{C.setSectionColumns(S.EditorState.create({doc:preservedDoc}),{kind:'equal',count:2,space:720,separator:false},'section',columnId)}catch(e){conversion=e.code==='unsupported-model'}check(conversion,'preserved conversion requires explicit choice');
      const extra='urn:extension', duplicateRaw=`<w:sectPr xmlns:w="${W}" xmlns:x="${extra}"><w:cols w:num="2" x:first="A"><x:firstChild/></w:cols><w:cols xmlns:z="urn:other" w:num="3" x:second="B" x:qname="z:thing"><w:col w:w="1000"/><x:secondChild/></w:cols><w:bidi x:first="C"><x:directionOne/></w:bidi><w:bidi w:val="0" x:second="D"><x:directionTwo/></w:bidi><w:docGrid w:linePitch="360"/></w:sectPr>`;
      const duplicateModel=JSON.parse(JSON.stringify(current));duplicateModel.version=2;for(const record of Object.values(duplicateModel.sections)){delete record.columns;delete record.flowDirection;}duplicateModel.sections[columnId].rawProperties=duplicateRaw;
      const duplicateDoc=M.parseDocumentHtml(L.wrapDocumentHtml(output.innerHTML,reopened.attrs.layout,duplicateModel),schema);let duplicateState=S.EditorState.create({doc:duplicateDoc,plugins:[H.history(),M.documentModelPlugin()]});const originalDuplicate=duplicateState.doc.toJSON();
      check(M.getDocumentModel(duplicateDoc).sections[columnId].columns.kind==='preserved'&&M.getDocumentModel(duplicateDoc).sections[columnId].flowDirection==='preserved','duplicate native properties remain preserved before conversion');
      duplicateState=apply(duplicateState,C.setSectionLayout(duplicateState,{columns:{kind:'equal',count:2,space:720,separator:false},flowDirection:'rtl'},'section',columnId,true));
      const convertedXml=M.sectionRecordXml(M.getDocumentModel(duplicateState.doc).sections[columnId]),converted=new DOMParser().parseFromString(convertedXml,'application/xml'),cols=converted.getElementsByTagNameNS(W,'cols'),bidi=converted.getElementsByTagNameNS(W,'bidi');
      check(cols.length===1&&bidi.length===1&&cols[0].getAttributeNS(extra,'first')==='A'&&cols[0].getAttributeNS(extra,'second')==='B'&&bidi[0].getAttributeNS(extra,'first')==='C'&&bidi[0].getAttributeNS(extra,'second')==='D','conversion merges all nonconflicting extension attributes');
      check(['firstChild','secondChild','directionOne','directionTwo'].every(name=>converted.getElementsByTagNameNS(extra,name).length===1)&&converted.getElementsByTagNameNS(W,'col').length===0&&converted.getElementsByTagNameNS(W,'docGrid').length===1&&cols[0].lookupNamespaceURI('z')==='urn:other'&&cols[0].getAttributeNS(extra,'qname')==='z:thing','conversion preserves unknown children, namespace values and unrelated section properties');
      const convertedBody=document.createElement('div');convertedBody.appendChild(P.DOMSerializer.fromSchema(schema).serializeFragment(duplicateState.doc.content));const convertedReopened=M.parseDocumentHtml(L.wrapDocumentHtml(convertedBody.innerHTML,duplicateState.doc.attrs.layout,duplicateState.doc.attrs.documentModel),schema),reopenedXml=M.sectionRecordXml(M.getDocumentModel(convertedReopened).sections[columnId]);check(reopenedXml.includes('secondChild')&&reopenedXml.includes('directionTwo')&&reopenedXml.includes('z:thing'),'converted native extensions survive save and reopen');
      let restoredDuplicate;H.undo(duplicateState,tr=>{restoredDuplicate=apply(duplicateState,tr)});check(same(restoredDuplicate.doc.toJSON(),originalDuplicate),'one undo restores original duplicate native records');
      const conflictRaw=duplicateRaw.replace('x:second="B"','x:first="DIFFERENT"'),conflictModel=JSON.parse(JSON.stringify(duplicateModel));conflictModel.sections[columnId].rawProperties=conflictRaw;
      const conflictDoc=M.parseDocumentHtml(L.wrapDocumentHtml(output.innerHTML,reopened.attrs.layout,conflictModel),schema),conflictState=S.EditorState.create({doc:conflictDoc,plugins:[H.history(),M.documentModelPlugin()]}),conflictBefore=conflictState.doc.toJSON();
      let rejectedConflict=false;try{C.setSectionLayout(conflictState,{columns:{kind:'equal',count:2,space:720,separator:false},flowDirection:'rtl'},'all',targets[0],true)}catch(error){rejectedConflict=error.code==='unsupported-model'}check(rejectedConflict&&same(conflictState.doc.toJSON(),conflictBefore),'conflicting extension values reject all-section conversion atomically');
      const bidiConflict=duplicateRaw.replace('x:second="D"','x:first="CONFLICT"'),direct=new DOMParser().parseFromString(bidiConflict,'application/xml'),beforeDirect=new XMLSerializer().serializeToString(direct.documentElement);let directRejected=false;try{SC.writeSectionColumns(direct.documentElement,{kind:'equal',count:2,space:720,separator:false},'ltr')}catch(error){directRejected=error.code==='unsupported-model'}check(directRejected&&new XMLSerializer().serializeToString(direct.documentElement)===beforeDirect,'direct write validates both properties before mutating either');
      const prefixConflict=duplicateRaw.replace('xmlns:z="urn:other"','xmlns:x="urn:different" xmlns:z="urn:other"'),prefixDoc=new DOMParser().parseFromString(prefixConflict,'application/xml'),beforePrefix=new XMLSerializer().serializeToString(prefixDoc.documentElement);let prefixRejected=false;try{SC.writeSectionColumns(prefixDoc.documentElement,{kind:'equal',count:2,space:720,separator:false},'preserved')}catch(error){prefixRejected=error.code==='unsupported-model'}check(prefixRejected&&new XMLSerializer().serializeToString(prefixDoc.documentElement)===beforePrefix,'conflicting extension namespace prefixes reject conversion without mutation');
      const parsedBreak=M.parseDocumentHtml('<p>one<br data-edtr-column-break="true">two<br>three</p>',schema);
      check(parsedBreak.firstChild.child(1).type.name==='column_break'&&parsedBreak.firstChild.child(3).type.name==='hard_break','column break HTML remains distinct from line break');
      let breakState=create('<p>text</p>');breakState=withCursor(breakState,5);
      check(B.insertColumnBreak(breakState,tr=>{breakState=apply(breakState,tr)}),'structural column break inserted');
      breakState=apply(breakState,breakState.tr.delete(5,6));
      let breakUndo;check(H.undo(breakState,tr=>{breakUndo=apply(breakState,tr)}),'break deletion undo available');breakState=breakUndo;
      check(breakState.doc.firstChild.lastChild.type.name==='column_break','first undo restores break after immediate deletion');
      check(H.undo(breakState,tr=>{breakUndo=apply(breakState,tr)}),'break insertion undo available');breakState=breakUndo;
      check(breakState.doc.firstChild.childCount===1 && breakState.doc.textContent==='text','second undo removes only insertion');
      const tabsNormalized=M.parseDocumentHtml('<p>LEFT\tRIGHT</p><pre>CODE\tTAB</pre>',schema);let atomCount=0;tabsNormalized.descendants(node=>{if(node.type.name==='tab')atomCount++;});
      check(atomCount===1 && tabsNormalized.lastChild.textContent==='CODE\tTAB','v2 normalizes real text tabs while preserving code-block literal tabs');
      const imported=(final,first=originalId,extra='')=>`<div data-edtr-docx-final-section-id="${final}">${source.replace('<p ',`<p data-edtr-section-end="${first}" `).replace('<p>GAMMA',`<p ${extra}>GAMMA`)}</div>`;
      const marked=M.parseDocumentHtml(imported(lastId),schema);check(same(D.documentSections(marked).map(s=>s.id),[originalId,lastId]),'complete valid native IDs are reused');
      const duplicate=M.parseDocumentHtml(imported(originalId),schema);check(D.documentSections(duplicate).every(s=>s.id!==originalId),'duplicate native marker set regenerates every section');
      const partial=M.parseDocumentHtml(imported(''),schema);check(D.documentSections(partial).every(s=>s.id!==originalId),'partial native marker set regenerates every section');
      const stray=M.parseDocumentHtml(imported(lastId,originalId,`data-edtr-section-end="${lastId}"`),schema);check(D.documentSections(stray).length===2 && D.documentSections(stray).every(s=>s.id!==originalId&&s.id!==lastId),'extra native marker is discarded without inventing a section');
      let spaces=create('<p>FIRST PART SECOND PART</p>');spaces=withCursor(spaces,12);spaces=apply(spaces,C.insertDocumentSection(spaces,'nextPage'));
      const spaceDom=document.createElement('div');spaceDom.appendChild(P.DOMSerializer.fromSchema(schema).serializeFragment(spaces.doc.content));
      const spaceReload=M.parseDocumentHtml(L.wrapDocumentHtml(spaceDom.innerHTML,spaces.doc.attrs.layout,spaces.doc.attrs.documentModel),schema);
      check(spaces.doc.textContent==='FIRST PART SECOND PART' && spaceReload.textContent===spaces.doc.textContent,'split and reopen preserve whitespace exactly at section boundaries');
      state = withCursor(state, 7); const before = state.doc.toJSON();
      state = apply(state, C.insertDocumentSection(state,'nextPage')); sections = D.documentSections(state.doc);
      check(sections.length === 3 && sections[0].id === originalId && sections[2].id === lastId, 'inserting keeps original left and subsequent section IDs');
      check(state.doc.textContent === 'ALPHA BETAGAMMA DELTA', 'safe split loses or duplicates no text');
      const inserted = sections[1].id;
      check(M.getDocumentModel(state.doc).sections[inserted].start === 'nextPage', 'new section has requested start');
      check(state.doc.attrs.layout.running['0:default:header'].html.includes('HEADER ZERO'), 'existing header does not shift to inserted section');
      check(state.doc.attrs.layout.running['1:default:header'].linked === true, 'new section links to preceding header');
      check(M.getDocumentModel(state.doc).sections[inserted].numbering.start === undefined, 'insertion does not restart numbering');
      let undoState; check(H.undo(state, tr=>{undoState=apply(state,tr);}), 'insert is undoable'); state=undoState;
      check(same(state.doc.toJSON(),before), 'one undo reverts split, IDs, raw XML and registry');
      let redoState; H.redo(state,tr=>{redoState=apply(state,tr);}); state=redoState;
      const changed = C.setSectionGeometry(state,{width:16838,height:11906},'section',inserted); state=apply(state,changed);
      check(D.documentSections(state.doc)[1].geometry.width===16838 && D.documentSections(state.doc)[0].geometry.width===11906, 'orientation update has section scope');
      let rejected=false;try{C.setSectionGeometry(state,{margins:{left:-1,right:0,top:0,bottom:0}},'section',inserted);}catch(e){rejected=e.code==='invalid-geometry';}check(rejected,'negative margins rejected');
      const settings = M.getDocumentModel(state.doc).sections[originalId];
      check(M.sectionRecordXml(settings).includes('chapStyle="1"'), 'unknown pgNumType properties survive projection');
      state=apply(state,C.removeDocumentSectionBoundary(state,originalId,'keepBefore'));
      check(D.documentSections(state.doc).length===2 && D.documentSections(state.doc)[0].id===originalId, 'keepBefore retains preceding ID and geometry');
      check(!M.getDocumentModel(state.doc).sections[inserted], 'removed section registry is removed atomically');
      let following=create(source);following=apply(following,C.removeDocumentSectionBoundary(following,D.documentSections(following.doc)[0].id,'keepAfter'));
      check(D.documentSections(following.doc).length===1 && D.documentSections(following.doc)[0].id===M.getDocumentModel(following.doc).finalSectionId,'keepAfter retains following identity');
      check(following.doc.attrs.layout.running['0:default:header'].html.includes('HEADER ZERO'),'keepAfter materializes an edited inherited header');
      const chainRaw=raw.replace('<w:pgSz','<w:footerReference w:type="default" r:id="EDTRSource_f1"/><w:pgSz');
      let chain=create(L.wrapDocumentHtml(`<p data-docx-properties="${chainRaw.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">ALPHA BETA</p><p>GAMMA DELTA</p>`,legacyLayout));
      chain=withCursor(chain,7);chain=apply(chain,C.insertDocumentSection(chain,'continuous'));
      const chainBefore=chain.doc.toJSON(), chainSections=D.documentSections(chain.doc), oldFinal=M.getDocumentModel(chain.doc).finalSectionId;
      chain=apply(chain,chain.tr.delete(0,chainSections[1].to));
      check(D.documentSections(chain.doc).length===1 && D.documentSections(chain.doc)[0].id===oldFinal,'ordinary deletion of multiple boundaries keeps the old final identity');
      check(chain.doc.attrs.layout.running['0:default:header'].html.includes('HEADER ZERO'),'multiple removed boundaries preserve the full edited header inheritance chain');
      check(M.getDocumentModel(chain.doc).sections[oldFinal].rawProperties.includes('EDTRSource_f1'),'multiple removed boundaries preserve native footer inheritance');
      let undoChain;H.undo(chain,tr=>{undoChain=apply(chain,tr);});
      if(!same(undoChain.doc.toJSON(),chainBefore)){
        const diff=(a,b,p='$')=>{if(same(a,b))return null;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=diff(a[k],b[k],p+'.'+k);if(d)return d;}}return{path:p,actual:a,expected:b};};
        throw new Error('Deletion undo mismatch '+JSON.stringify(diff(undoChain.doc.toJSON(),chainBefore)));
      }
      check(true,'one undo restores multiple deleted boundaries and every inherited record');
      // Enter on a paragraph that ends a section keeps the boundary at its rightmost split.
      let split=create(source);split=withCursor(split,4);split=apply(split,split.tr.split(4));
      check(D.documentSections(split.doc).length===2,'ordinary Enter does not duplicate section identity');
      // Clipboard content carries text/objects but cannot introduce duplicate section endpoints.
      const plugin=M.documentModelPlugin(), slice=new P.Slice(state.doc.content,0,0), cleaned=plugin.props.transformPasted(slice);
      let boundaries=0;cleaned.content.descendants(node=>{if(node.attrs.sectionEndId||String(node.attrs.docxProperties||'').includes('sectPr'))boundaries++;});
      check(boundaries===0,'normal clipboard strips section identities and raw section properties');
      let blocked=0, wrapping=S.EditorState.create({doc:M.parseDocumentHtml(source,schema),plugins:[H.history(),M.documentModelPlugin(()=>blocked++)]});
      wrapping=withCursor(wrapping,2);const beforeWrap=wrapping.doc;
      list.wrapInList(schema.nodes.bullet_list)(wrapping,tr=>{wrapping=apply(wrapping,tr);});
      check(blocked===1 && wrapping.doc.eq(beforeWrap),'wrapping a section-ending paragraph in a list is rejected intact with one explanation');
      let future=false;try{M.parseDocumentHtml('<div data-edtr-model="{&quot;version&quot;:99}"><p>FUTURE</p></div>',schema);}catch(e){future=e.code==='unsupported-version';}check(future,'future model rejected before schema parse');
      const bad=JSON.parse(JSON.stringify(M.getDocumentModel(reopened))), badId=bad.finalSectionId;bad.sections[badId].running=[];
      let malformed=false;try{M.parseDocumentHtml(L.wrapDocumentHtml(output.innerHTML,reopened.attrs.layout,bad),schema);}catch(e){malformed=e.code==='invalid-model';}check(malformed,'malformed v1 running registry rejected without normalization');
      bad.sections[badId].running={};bad.sections[badId].rawProperties=`<w:pPr xmlns:w="${W}"/>`;malformed=false;
      try{M.parseDocumentHtml(L.wrapDocumentHtml(output.innerHTML,reopened.attrs.layout,bad),schema);}catch(e){malformed=e.code==='invalid-model';}check(malformed,'malformed native section root rejected');
      let nested=create('<ul><li><p>LIST TEXT</p></li></ul>');nested=withCursor(nested,3);let noNested=false;try{C.insertDocumentSection(nested,'continuous');}catch(e){noNested=e.code==='unsupported-cursor';}check(noNested,'nested insert rejects intact');
      // Loading a new document with a newly created history plugin cannot resurrect an old graph.
      let first=create('<p>OLD</p>');first=apply(first,first.tr.insertText(' EDIT',4));
      const retained=first.plugins.filter(plugin=>!plugin.key.startsWith('history$'));
      first=first.reconfigure({plugins:retained}); const loaded=M.parseDocumentHtml('<p>NEW</p>',schema);
      first=apply(first,first.tr.replaceWith(0,first.doc.content.size,loaded.content).setDocAttribute('layout',loaded.attrs.layout).setDocAttribute('documentModel',loaded.attrs.documentModel).setMeta('addToHistory',false));
      first=first.reconfigure({plugins:[...retained,H.history()]});check(H.undo(first)===false && first.doc.textContent==='NEW','reconfigured history isolates document loading');
      return {checks};
    });
    assert.ok(result.checks>=25); console.log(`PASS ${result.checks} model/command/browser-DOM checks: migration, IDs, native unknown attrs, index projections, split/remove/settings, undo, clipboard, future version and document history isolation.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
