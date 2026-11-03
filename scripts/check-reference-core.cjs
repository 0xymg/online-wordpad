/* eslint-disable @typescript-eslint/no-require-imports */
/** Actual ProseMirror state, history, clipboard-subgraph and model version tests. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const original = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => {
  let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  code = code.replace(/require\(["']@\/([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(path.join(root, name))})`);
  module._compile(code, file);
};
const R = require('../lib/document-references.ts'), M = require('../lib/document-model.ts'), { mySchema: schema } = require('../app/components/editor-schema.ts');
if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts'];
const { EditorState, TextSelection } = require('prosemirror-state'), { Slice } = require('prosemirror-model'), { history, undo, redo } = require('prosemirror-history');
const id = (kind, n) => kind + '_' + n.toString(16).padStart(32, '0'), entropy = (start = 1000) => { let n = start; return () => (n++).toString(16).padStart(32, '0'); };
const h = (text, targetId = id('tgt', 1), level = 1) => schema.nodes.heading.create({ level, targetId }, schema.text(text));
const p = (text, attrs) => schema.nodes.paragraph.create(attrs, typeof text === 'string' ? schema.text(text) : text);
const f = (targetId, attrs = {}) => schema.nodes.reference_field.create({ fieldId: id('fld', 1), targetId, ...attrs });
const doc = nodes => schema.nodes.doc.create(null, nodes), stateFor = nodes => EditorState.create({ doc: doc(nodes), plugins: [history(), R.referenceIdentityPlugin(entropy())] });
const apply = (state, tr) => state.applyTransaction(tr).state;
const run = (state, command) => { let next; assert.equal(command(state, tr => { next = apply(state, tr); }), true); return next; };

test('index derives heading and caption numbers without mutating text or IDs', () => {
 const source = doc([h('First'),h('Child',id('tgt',2),2),p('Photo',{targetKind:'caption',captionLabel:'Figure',targetId:id('tgt',3)}),p('Table',{targetKind:'caption',captionLabel:'Table',targetId:id('tgt',4)}),p('Photo 2',{targetKind:'caption',captionLabel:'Figure',targetId:id('tgt',5)})]), json=source.toJSON();
 const index=R.collectReferenceIndex(source); assert.deepEqual(index.targets.map(t=>t.number),['','','1','1','2']); assert.deepEqual(source.toJSON(),json);
 assert.equal(R.lookupReferenceTarget(index,id('tgt',1)).target.text,'First'); assert.equal(R.lookupReferenceTarget(index,id('tgt',99)).status,'missing-target');
});
test('renaming, moving, deleting and undo do not rebind target identities by text', () => {
 let state=stateFor([h('Same'),h('Same',id('tgt',2)),p([f(id('tgt',1))])]);
 state=apply(state,state.tr.insertText('Renamed',1,5)); assert.equal(state.doc.firstChild.attrs.targetId,id('tgt',1));
 const original=state.doc.firstChild; state=apply(state,state.tr.delete(0,original.nodeSize).insert(state.doc.child(1).nodeSize,original)); assert.equal(R.collectReferenceIndex(state.doc).targets[1].id,id('tgt',1));
 const moved=R.collectReferenceIndex(state.doc).targets[1]; state=apply(state,state.tr.delete(moved.pos,moved.end)); assert.equal(R.lookupReferenceTarget(R.collectReferenceIndex(state.doc),id('tgt',1)).status,'missing-target');
 let restored; undo(state,tr=>{restored=apply(state,tr);}); assert.ok(restored); assert.ok(R.collectReferenceIndex(restored.doc).targets.some(t=>t.id===id('tgt',1)));
});
test('heading split allocates one fresh identity and undo/redo restores exactly', () => {
 let state=stateFor([h('Heading')]), before=state.doc.toJSON(); state=apply(state,state.tr.split(4));
 const after=state.doc.toJSON(), ids=R.collectReferenceIndex(state.doc).targets.map(t=>t.id); assert.equal(ids[0],id('tgt',1)); assert.equal(new Set(ids).size,2);
 let undone; undo(state,tr=>{undone=apply(state,tr);}); assert.deepEqual(undone.doc.toJSON(),before);
 let redone; redo(undone,tr=>{redone=apply(undone,tr);}); assert.deepEqual(redone.doc.toJSON(),after);
});
test('load repairs duplicates but leaves references explicitly ambiguous, and is idempotent', () => {
 const source=doc([h('One'),h('Two'),p([f(id('tgt',1))])]); assert.equal(R.lookupReferenceTarget(R.collectReferenceIndex(source),id('tgt',1)).status,'ambiguous');
 const normalized=R.normalizeReferenceIdentities(source,entropy()), index=R.collectReferenceIndex(normalized); assert.equal(new Set(index.targets.map(t=>t.id)).size,2);
 assert.equal(index.fields[0].node.attrs.status,'ambiguous'); assert.equal(index.fields[0].node.attrs.targetId,null); assert.deepEqual(R.normalizeReferenceIdentities(normalized,()=>{throw Error('must not allocate');}).toJSON(),normalized.toJSON());
 assert.equal(source.child(1).attrs.targetId,id('tgt',1));
});
test('copy clones internal subgraph while trusted local external links remain linked', () => {
 const source=doc([h('Inside'),p([f(id('tgt',1)),f(id('tgt',2),{fieldId:id('fld',2)})])]), destination=doc([h('Existing',id('tgt',2))]);
 const slice=new Slice(source.content,0,0), copied=R.cloneReferenceSlice(slice,destination,{sameSession:true,createToken:entropy()}), index=R.collectReferenceIndex(doc(copied.content));
 assert.notEqual(index.targets[0].id,id('tgt',1)); assert.equal(index.fields[0].node.attrs.targetId,index.targets[0].id); assert.equal(index.fields[1].node.attrs.targetId,id('tgt',2)); assert.notEqual(index.fields[0].node.attrs.fieldId,id('fld',1));
 const external=R.collectReferenceIndex(doc(R.cloneReferenceSlice(slice,destination,{createToken:entropy()}).content)); assert.equal(external.fields[1].node.attrs.targetId,null); assert.equal(external.fields[1].node.attrs.status,'missing-target');
});
test('cut move preserves IDs only after all original definitions disappeared', () => {
 const source=doc([h('Move'),p([f(id('tgt',1))])]), slice=new Slice(source.content,0,0);
 const moved=R.cloneReferenceSlice(slice,doc([p('Empty')]),{sameSession:true,move:true,createToken:entropy()}); assert.equal(moved.content.firstChild.attrs.targetId,id('tgt',1)); assert.equal(moved.content.child(1).firstChild.attrs.fieldId,id('fld',1));
 const blocked=R.cloneReferenceSlice(slice,source,{sameSession:true,move:true,createToken:entropy()}); assert.notEqual(blocked.content.firstChild.attrs.targetId,id('tgt',1));
});
test('duplicate pasted IDs never choose an internal or destination winner', () => {
 const source=doc([h('One'),h('Two'),p([f(id('tgt',1))])]), slice=new Slice(source.content,0,0);
 const pasted=R.collectReferenceIndex(doc(R.cloneReferenceSlice(slice,doc([h('Existing')]),{sameSession:true,createToken:entropy()}).content)); assert.equal(pasted.fields[0].node.attrs.status,'ambiguous'); assert.equal(pasted.fields[0].node.attrs.targetId,null);
});
test('bookmark command wraps selection and survives insertion and undo as one edit', () => {
 let state=stateFor([p('Selected text')]); state=apply(state,state.tr.setSelection(TextSelection.create(state.doc,1,9))); const before=state.doc.toJSON();
 state=run(state,R.createBookmark('Selection')); const target=R.collectReferenceIndex(state.doc).targets[0]; assert.equal(target.kind,'bookmark'); assert.equal(target.text,'Selected'); assert.equal(target.name,'Selection');
 let undone; undo(state,tr=>{undone=apply(state,tr);}); assert.deepEqual(undone.doc.toJSON(),before);
});
test('reference editing keeps field identity and resets cached native semantics', () => {
 let state=stateFor([h('First'),h('Second',id('tgt',2)),p([f(id('tgt',1),{instruction:' REF OLD ',nativeName:'OLD',nativeXml:'<native/>',status:'unsupported'})])]);
 const field=R.collectReferenceIndex(state.doc).fields[0]; state=run(state,R.editCrossReference(field.pos,{targetId:id('tgt',2),display:'page'})); const edited=R.collectReferenceIndex(state.doc).fields[0].node;
 assert.equal(edited.attrs.fieldId,id('fld',1)); assert.equal(edited.attrs.targetId,id('tgt',2)); assert.equal(edited.attrs.instruction,null); assert.equal(edited.attrs.nativeXml,null); assert.equal(edited.attrs.status,'pending');
});
test('TOC config allocates a stable field and edits levels as one transaction', () => {
 let state=stateFor([p('Before')]); state=run(state,R.insertTableOfContents([3,1,1,9],'Contents')); let toc=R.collectReferenceIndex(state.doc).tocs[0]; assert.deepEqual(toc.levels,[1,3]); const fieldId=toc.fieldId;
 state=run(state,R.updateTableOfContents(toc.pos,[2])); toc=R.collectReferenceIndex(state.doc).tocs[0]; assert.equal(toc.fieldId,fieldId); assert.deepEqual(toc.levels,[2]);
});
test('v3 to v5 migration preserves document and section identities, future guard runs before DOM parsing', () => {
 const sec=id('sec',1), model={version:3,id:id('doc',1),finalSectionId:sec,sections:{[sec]:{page:{width:11906,height:16838,margins:{top:1440,right:1440,bottom:1440,left:1440}},start:'nextPage',numbering:{},running:{},columns:{kind:"equal",count:2,space:720,separator:false},flowDirection:'ltr'}}};
 // getDocumentModel is pure and upgrades without mutating an old snapshot.
 const migrated=M.getDocumentModel(schema.nodes.doc.create({documentModel:model},[p('Legacy')])); assert.equal(migrated.version,5); assert.equal(migrated.id,model.id); assert.equal(migrated.finalSectionId,sec); assert.equal(model.version,3); assert.equal(migrated.sections[sec].columns.count,2);
 const future={...model,version:6}; assert.throws(()=>M.readDocumentModel({hasAttribute:()=>true,getAttribute:()=>JSON.stringify(future)}),error=>error.code==='unsupported-version');
});

test('live non-split duplicate insertion marks existing fields ambiguous', () => {
 let state=stateFor([h('Original'),p([f(id('tgt',1))])]); state=apply(state,state.tr.insert(0,h('Untrusted duplicate')));
 const index=R.collectReferenceIndex(state.doc); assert.equal(index.fields[0].node.attrs.status,'ambiguous'); assert.equal(index.fields[0].node.attrs.targetId,null);
});
test('split keeps existing references attached to the original left heading', () => {
 let state=stateFor([h('Heading'),p([f(id('tgt',1))])]); state=apply(state,state.tr.split(4));
 const field=R.collectReferenceIndex(state.doc).fields[0].node; assert.equal(field.attrs.targetId,id('tgt',1)); assert.notEqual(field.attrs.status,'ambiguous');
});
test('partial or deleted bookmark boundaries never define a target', () => {
 const start=schema.nodes.bookmark_start.create({targetId:id('tgt',1),name:'Partial'}), end=schema.nodes.bookmark_end.create({targetId:id('tgt',1)});
 assert.equal(R.collectReferenceIndex(doc([p([start,schema.text('Unfinished')])])).targets.length,0);
 assert.equal(R.collectReferenceIndex(doc([p([schema.text('Missing start'),end])])).targets.length,0);
 const complete=doc([p([start,schema.text('Across')]),p([schema.text('paragraphs'),end])]); assert.equal(R.collectReferenceIndex(complete).targets[0].text,'Across paragraphs');
});
test('cross-paragraph bookmark wraps both boundaries without replacing selection text', () => {
 let state=stateFor([p('Alpha'),p('Beta')]); state=apply(state,state.tr.setSelection(TextSelection.create(state.doc,2,11)));
 const before=state.doc.textContent; state=run(state,R.createBookmark('Span')); const target=R.collectReferenceIndex(state.doc).targets[0]; assert.equal(target.text,'lpha Bet'); assert.equal(state.doc.textContent,before);
});
test('caption and TOC insert after the selected block without deleting selected text', () => {
 let state=stateFor([p('Keep selected text')]); state=apply(state,state.tr.setSelection(TextSelection.create(state.doc,1,5)));
 state=run(state,R.insertCaption('Figure','Description')); assert.equal(state.doc.firstChild.textContent,'Keep selected text');
 const index=R.collectReferenceIndex(state.doc), target=index.targets[0]; assert.equal(target.kind,'caption'); assert.equal(target.text,'Figure 1 Description'); assert.equal(index.fields[0].node.attrs.targetId,target.id); assert.equal(index.fields[0].node.attrs.instruction,'SEQ Figure');
 state=run(state,R.insertTableOfContents([1],'Contents')); assert.equal(state.doc.childCount,3); assert.equal(state.doc.firstChild.textContent,'Keep selected text');
});

test('split at heading start preserves the content-bearing target rather than the empty prefix', () => {
 let state=stateFor([h('Heading'),p([f(id('tgt',1))])]); state=apply(state,state.tr.split(1)); const index=R.collectReferenceIndex(state.doc);
 assert.notEqual(index.targets[0].id,id('tgt',1)); assert.equal(index.targets[1].id,id('tgt',1)); assert.equal(index.fields[0].node.attrs.targetId,index.targets[1].id);
});

test('unnumbered targets cannot receive number fields through direct commands', () => {
 const state=stateFor([h('Unnumbered'),p([f(id('tgt',1))])]), field=R.collectReferenceIndex(state.doc).fields[0];
 assert.equal(R.insertCrossReference(id('tgt',1),'number')(state),false); assert.equal(R.editCrossReference(field.pos,{targetId:id('tgt',1),display:'number'})(state),false);
});
test('converting a heading to plain text removes the target and reconversion gets a new identity', () => {
 let state=stateFor([h('Heading'),p([f(id('tgt',1))])]); state=apply(state,state.tr.setNodeMarkup(0,schema.nodes.paragraph,{...state.doc.firstChild.attrs}));
 assert.equal(state.doc.firstChild.attrs.targetId,null); assert.equal(R.lookupReferenceTarget(R.collectReferenceIndex(state.doc),id('tgt',1)).status,'missing-target');
 state=apply(state,state.tr.setNodeMarkup(0,schema.nodes.heading,{...state.doc.firstChild.attrs,level:1})); assert.notEqual(state.doc.firstChild.attrs.targetId,id('tgt',1));
});
test('explicit unsupported TOC edits replace native preservation with managed configuration', () => {
 let state=stateFor([p('TOC',{toc:{fieldId:id('fld',1),levels:[1],status:'unsupported',nativeSource:'<original/>'}})]); state=run(state,R.updateTableOfContents(0,[2]));
 assert.deepEqual(state.doc.firstChild.attrs.toc,{fieldId:id('fld',1),levels:[2]});
});

for (const [label,offset] of [['before label',0],['before sequence',7],['after sequence',8],['inside description',13]]) test('caption split '+label+' keeps the SEQ-owning identity and is one undo', () => {
 let state=stateFor([p('Before')]); state=run(state,R.insertCaption('Figure','Description'));
 const original=R.collectReferenceIndex(state.doc).targets[0], originalId=original.id, caption=state.doc.nodeAt(original.pos);
 state=apply(state,state.tr.insert(state.doc.content.size,p([f(originalId,{fieldId:id('fld',99)})]))); const before=state.doc.toJSON();
 state=apply(state,state.tr.split(original.pos+1+offset)); const index=R.collectReferenceIndex(state.doc), targets=index.targets.filter(target=>target.kind==='caption');
 assert.equal(targets.length,1); assert.equal(targets[0].id,originalId); assert.ok(state.doc.nodeAt(targets[0].pos).content.content.some(child=>child.type.name==='reference_field'&&child.attrs.targetId===originalId));
 assert.equal(index.fields.find(field=>field.node.attrs.fieldId===id('fld',99)).node.attrs.targetId,originalId);
 let undone;undo(state,tr=>{undone=apply(state,tr);});assert.deepEqual(undone.doc.toJSON(),before); assert.equal(caption.attrs.targetId,originalId);
});

test('partial bookmark boundaries cannot corrupt an existing destination target', () => {
 const target=id('tgt',1), start=schema.nodes.bookmark_start.create({targetId:target,name:'Original'}), end=schema.nodes.bookmark_end.create({targetId:target});
 const source=doc([p([start,schema.text('text'),end])]);
 for(const boundary of [start,end]) { const cloned=R.cloneReferenceSlice(new Slice(require('prosemirror-model').Fragment.from(boundary),0,0),source,{sameSession:true,createToken:entropy()}); assert.equal(cloned.content.size,0); }
 const pair=R.cloneReferenceSlice(new Slice(source.content,0,0),source,{sameSession:true,createToken:entropy()}); const index=R.collectReferenceIndex(doc(pair.content)); assert.equal(index.targets.length,1); assert.notEqual(index.targets[0].id,target);
});
