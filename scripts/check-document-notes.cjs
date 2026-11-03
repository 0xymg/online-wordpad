/* eslint-disable @typescript-eslint/no-require-imports */
/** Canonical owner graphs, note-local body validation, history and flat projection. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { test } = require('node:test');
const root = path.resolve(__dirname, '..'), original = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => { let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText; code = code.replace(/require\(["']@\/([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(path.join(root, name))})`); module._compile(code, file); };
const N = require('../lib/document-notes.ts'), R = require('../lib/document-references.ts');
if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts'];
const { Schema, Fragment, Slice } = require('prosemirror-model'), { schema: basic } = require('prosemirror-schema-basic'), { addListNodes } = require('prosemirror-schema-list'), { EditorState, TextSelection } = require('prosemirror-state'), { history, undo, redo } = require('prosemirror-history');
let nodes = addListNodes(basic.spec.nodes.update('doc', { content: 'block+', attrs: { documentModel: { default: null } } }), 'paragraph block*', 'block');
for (const name of ['paragraph', 'bullet_list', 'ordered_list']) nodes = nodes.update(name, { ...nodes.get(name), attrs: { ...nodes.get(name).attrs, sectionEndId: { default: null }, docxProperties: { default: null }, ...N.noteProjectionAttrs } });
nodes = nodes.addToEnd('note_reference', { inline: true, group: 'inline', atom: true, attrs: { noteId: { default: null }, cachedLabel: { default: '…' } } }).addToEnd('tab', { inline: true, group: 'inline', atom: true });
const schema = new Schema({ nodes, marks: basic.spec.marks.addToEnd('superscript', {}) });
const id = (kind, n) => `${kind}_${n.toString(16).padStart(32,'0')}`, sec1 = id('sec',1), sec2 = id('sec',2), n1 = id('nte',1), n2 = id('nte',2), entropy = (n=100) => () => (n++).toString(16).padStart(32,'0');
const p = (text='', attrs) => schema.nodes.paragraph.create(attrs, typeof text === 'string' ? text ? schema.text(text) : undefined : text), ref = noteId => schema.nodes.note_reference.create({ noteId });
const body = text => ({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}), record = (text='Note',kind='endnote') => ({kind,body:body(text)});
const model = (notes={}, extra={}) => ({version:5,id:id('doc',1),finalSectionId:sec1,sections:{[sec1]:{}},notes,notePolicy:N.defaultNotePolicy(),...extra});
const doc = (blocks, value=model()) => schema.nodes.doc.create({documentModel:value},blocks);
const stateFor = (blocks, value=model()) => EditorState.create({doc:doc(blocks,value),plugins:[history(),N.notePlugin()]});
const apply=(state,tr)=>state.applyTransaction(tr).state, run=(state,command)=>{let next;assert.equal(command(state,tr=>next=apply(state,tr)),true);return next;};

test('body validator accepts schema paragraphs/lists/tabs and normalizes empty bodies',()=>{
 const valid={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Text'},{type:'tab'}]},{type:'bullet_list',content:[{type:'list_item',content:[{type:'paragraph',content:[{type:'text',text:'Item'}]}]}]}]};
 assert.equal(N.validateNoteBody(valid,schema).content.length,2);assert.equal(N.validateNoteBody({type:'doc',content:[]},schema).content[0].type,'paragraph');
});
test('body validator rejects unknown/dangerous content before schema can discard metadata',()=>{
 for(const value of [{type:'doc',content:[{type:'heading',attrs:{level:2}}]},{type:'doc',content:[{type:'paragraph',attrs:{sectionEndId:sec1}}]},{type:'doc',content:[{type:'paragraph',attrs:{unknown:'lost'}}]},{type:'doc',content:[{type:'paragraph',content:[{type:'note_reference',attrs:{noteId:n1}}]}]},{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'bad',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]}]) assert.throws(()=>N.validateNoteBody(value,schema),N.NoteError);
});
test('graph reports missing/duplicate/orphan owners and never binds by label',()=>{
 const d=doc([p([ref(n1),ref(n1),ref(n2)])],model({[n1]:record(),[id('nte',3)]:record()})), codes=N.validateNoteGraph(d).map(item=>item.code);
 assert.ok(codes.includes('duplicate-note-owner'));assert.ok(codes.includes('missing-note-body'));assert.ok(codes.includes('orphan-note'));assert.equal(N.collectNoteIndex(d).byId.get(n1).length,2);
});
test('separate kind counters and stable section IDs determine restart labels',()=>{
 const notes={[n1]:record(),[n2]:record(),[id('nte',3)]:record('Foot','footnote')}, policy=N.defaultNotePolicy();policy.endnote={...policy.endnote,restart:'eachSection',start:3,format:'lowerRoman'};
 const d=doc([p([ref(n1),ref(id('nte',3))],{sectionEndId:sec1}),p([ref(n2)])],model(notes,{finalSectionId:sec2,sections:{[sec1]:{},[sec2]:{}},notePolicy:policy}));
 assert.deepEqual(N.collectNoteIndex(d).notes.map(entry=>entry.label),['iii','1','iii']);assert.equal(N.noteNumberLabel(27,'upperLetter'),'AA');assert.throws(()=>N.noteNumberLabel(4000,'lowerRoman'));
});
test('insert and body update preserve registry attrs and undo redo full graph',()=>{
 let state=stateFor([p('Main')],model({}, {foreignMetadata:{keep:true}}));const before=state.doc.toJSON();state=run(state,N.insertNote('endnote',body('Body'),entropy()));
 let entry=N.collectNoteIndex(state.doc).notes[0];assert.equal(entry.label,'1');assert.equal(state.doc.attrs.documentModel.foreignMetadata.keep,true);assert.ok(state.doc.lastChild.attrs.noteOwnerId);const after=state.doc.toJSON();
 let undone;undo(state,tr=>undone=apply(state,tr));assert.deepEqual(undone.doc.toJSON(),before);let redone;redo(undone,tr=>redone=apply(undone,tr));assert.deepEqual(redone.doc.toJSON(),after);
 state=run(redone,N.updateNoteBody(entry.noteId,body('Changed')));assert.equal(state.doc.lastChild.textContent,'1 Changed');assert.equal(N.collectNoteIndex(state.doc).notes[0].noteId,entry.noteId);
});
test('ordinary owner deletion removes pool and generated blocks in same undo event',()=>{
 let state=run(stateFor([p('Main')]),N.insertNote('endnote',body('Only'),entropy()));const before=state.doc.toJSON(), entry=N.collectNoteIndex(state.doc).notes[0];
 state=apply(state,state.tr.delete(entry.pos,entry.pos+1));assert.equal(Object.keys(state.doc.attrs.documentModel.notes).length,0);assert.equal(state.doc.childCount,1);
 let restored;undo(state,tr=>restored=apply(state,tr));assert.deepEqual(restored.doc.toJSON(),before);
});
test('flat list projection prefixes first list paragraph and relocates section terminal',()=>{
 const list={type:'doc',content:[{type:'bullet_list',content:[{type:'list_item',content:[{type:'paragraph',content:[{type:'text',text:'Listed'}]}]}]}]}, policy=N.defaultNotePolicy();policy.endnote.placement='sectionEnd';
 const d=doc([p([ref(n1)],{sectionEndId:sec1}),p('Following')],model({[n1]:{kind:'endnote',body:list}},{finalSectionId:sec2,sections:{[sec1]:{},[sec2]:{}},notePolicy:policy}));
 const tr=N.projectEndnotes(EditorState.create({doc:d}).tr), projected=tr.doc;assert.equal(projected.child(1).type.name,'bullet_list');assert.equal(projected.child(1).attrs.sectionEndId,sec1);assert.equal(projected.firstChild.attrs.sectionEndId,null);assert.equal(projected.child(1).textContent,'1 Listed');assert.equal(projected.child(1).firstChild.firstChild.attrs.noteOwnerId,null);
 assert.deepEqual(N.unprojectEndnotes(EditorState.create({doc:projected}).tr).doc.toJSON(),d.toJSON());assert.equal(N.projectEndnotes(EditorState.create({doc:projected}).tr).docChanged,false);
});
test('convert preserves identity and renumbers both kinds without flattening pool',()=>{
 let state=stateFor([p([ref(n1),ref(n2)])],model({[n1]:record('First'),[n2]:record('Second')}));state=run(state,N.convertNote(n1,'footnote'));
 assert.deepEqual(N.collectNoteIndex(state.doc).notes.map(entry=>[entry.noteId,entry.kind,entry.label]),[[n1,'footnote','1'],[n2,'endnote','1']]);assert.equal(state.doc.lastChild.textContent,'1 Second');assert.equal(state.doc.attrs.documentModel.notes[n1].body.content[0].content[0].text,'First');
});
test('projection-only editing is rejected but main text range deletion can remove owners',()=>{
 let state=run(stateFor([p('Main')]),N.insertNote('endnote',body('Body'),entropy()));const endnotePos=state.doc.firstChild.nodeSize;
 const blocked=state.applyTransaction(state.tr.insertText('X',endnotePos+3));assert.equal(blocked.transactions.length,0);
 state=apply(state,state.tr.delete(0,state.doc.content.size).insert(0,p('Replacement')));assert.equal(state.doc.textContent,'Replacement');assert.equal(Object.keys(state.doc.attrs.documentModel.notes).length,0);
});
test('clipboard copies records deeply and move requires trusted absent owners',()=>{
 const source=doc([p([ref(n1)])],model({[n1]:record('Payload')})), slice=new Slice(source.content,0,0), payload=N.selectedNoteRecords(slice,source), destination=doc([p('Target')]);
 const copied=N.planNoteClipboard(slice,payload,destination,{createToken:entropy()}), newId=Object.keys(copied.notes)[0];assert.notEqual(newId,n1);assert.equal(copied.slice.content.firstChild.firstChild.attrs.noteId,newId);copied.notes[newId].body.content[0].content[0].text='Edited';assert.equal(payload.notes[n1].body.content[0].content[0].text,'Payload');
 const moved=N.planNoteClipboard(slice,payload,destination,{sameSession:true,move:true,createToken:entropy()});assert.equal(Object.keys(moved.notes)[0],n1);const untrusted=N.planNoteClipboard(slice,payload,destination,{move:true,createToken:entropy()});assert.notEqual(Object.keys(untrusted.notes)[0],n1);
 const occupied=N.planNoteClipboard(slice,payload,source,{sameSession:true,move:true,createToken:entropy()});assert.notEqual(Object.keys(occupied.notes)[0],n1);assert.throws(()=>N.planNoteClipboard(slice,null,destination),N.NoteError);
});
test('clipboard rejects mismatched/duplicate graph and preserves foreign model attrs',()=>{
 const destination=doc([p('Target')],model({}, {foreign:true})), slice=new Slice(Fragment.from(p([ref(n1)])),0,0);
 assert.throws(()=>N.planNoteClipboard(slice,{version:1,notes:{[n2]:record()}},destination),N.NoteError);assert.throws(()=>N.planNoteClipboard(new Slice(Fragment.from(p([ref(n1),ref(n1)])),0,0),{version:1,notes:{[n1]:record()}},destination),N.NoteError);
 const plan=N.planNoteClipboard(slice,{version:1,notes:{[n1]:record()}},destination,{createToken:entropy()}), tr=EditorState.create({doc:destination}).tr.insert(1,plan.slice.content.firstChild.content);N.applyNotePaste(tr,plan.notes);assert.equal(tr.doc.attrs.documentModel.foreign,true);assert.deepEqual(N.validateNoteGraph(tr.doc),[]);
});

/** Exercise the existing A4 clipboard consumer with real PM transactions.
 * XMLDOM supplies only clipboard carrier transport; schema parsing/layout is
 * separately covered by the browser acceptance suite. */
function clipboardHarness(state) {
 const {DOMParser: XMLParser, XMLSerializer}=require('@xmldom/xmldom');
 global.DOMParser=class {parseFromString(value){const parsed=new XMLParser().parseFromString(value,'text/html');parsed.querySelectorAll=selector=>Array.from(parsed.getElementsByTagName('*')).filter(el=>el.hasAttribute(selector.slice(1,-1)));return parsed;}};
 const xml=new XMLParser().parseFromString('<div/>','text/xml'), plugin=state.plugins.find(item=>item.props.handlePaste), data=new Map(), errors=[];
 const view={state,editable:true,dom:{dispatchEvent:event=>errors.push(event.detail.error)},dispatch(tr){this.state=apply(this.state,tr);},serializeForClipboard(slice){const dom=xml.createElement('div');dom.appendChild(xml.createElement('p'));Object.defineProperty(dom,'innerHTML',{get:()=>Array.from(dom.childNodes).map(node=>new XMLSerializer().serializeToString(node)).join('')});return{slice,dom,text:'Note marker'};}};
 const event={clipboardData:{files:[],clearData:()=>data.clear(),setData:(key,value)=>data.set(key,value),getData:key=>data.get(key)||''},preventDefault(){this.prevented=true;}};
 return{view,event,plugin,data,errors};
}
function clipboardState(blocks,value){return EditorState.create({doc:doc(blocks,value),plugins:[history(),R.referenceIdentityPlugin(entropy(300)),N.notePlugin()]});}
test('existing A4 handler cuts owner+pool, preserves identity once and clones second paste',()=>{
 const state=clipboardState([p([ref(n1),schema.text('Main')])],model({[n1]:record('Transport')})), harness=clipboardHarness(apply(state,state.tr.setSelection(TextSelection.create(state.doc,1,2))));
 const copied=harness.view.state.selection.content();assert.equal(harness.plugin.props.handleDOMEvents.cut(harness.view,harness.event),true);assert.equal(Object.keys(harness.view.state.doc.attrs.documentModel.notes).length,0);assert.ok(harness.data.get('text/html').includes(N.NOTE_CLIPBOARD_ATTRIBUTE));
 assert.equal(harness.plugin.props.handlePaste(harness.view,harness.event,copied),true);assert.deepEqual(harness.errors,[]);assert.equal(N.collectNoteIndex(harness.view.state.doc).notes[0].noteId,n1);
 harness.view.dispatch(harness.view.state.tr.setSelection(TextSelection.create(harness.view.state.doc,2)));
 assert.equal(harness.plugin.props.handlePaste(harness.view,harness.event,copied),true);assert.equal(N.collectNoteIndex(harness.view.state.doc).notes.length,2);assert.equal(new Set(N.collectNoteIndex(harness.view.state.doc).notes.map(entry=>entry.noteId)).size,2);
});
test('external note paste is atomic, missing/modified payload cannot partially edit destination',()=>{
 const source=doc([p([ref(n1)])],model({[n1]:record('Transport')})), copied=new Slice(source.content,0,0), target=clipboardHarness(clipboardState([p('Destination')],model({}, {foreign:'preserved'})));
 const {XMLSerializer,DOMParser: XMLParser}=require('@xmldom/xmldom'), carrier=new XMLParser().parseFromString('<div/>','text/xml').documentElement;carrier.setAttribute(N.NOTE_CLIPBOARD_ATTRIBUTE,JSON.stringify(N.selectedNoteRecords(copied,source)));target.data.set('text/html',new XMLSerializer().serializeToString(carrier));
 target.plugin.props.handlePaste(target.view,target.event,copied);assert.deepEqual(target.errors,[]);assert.equal(N.collectNoteIndex(target.view.state.doc).notes.length,1);assert.equal(target.view.state.doc.attrs.documentModel.foreign,'preserved');assert.notEqual(N.collectNoteIndex(target.view.state.doc).notes[0].noteId,n1);
 const before=target.view.state.doc.toJSON();target.data.set('text/html','<p>No payload</p>');target.plugin.props.handlePaste(target.view,target.event,copied);assert.equal(target.errors.length,1);assert.deepEqual(target.view.state.doc.toJSON(),before);
 carrier.setAttribute(N.NOTE_CLIPBOARD_ATTRIBUTE,JSON.stringify({version:1,notes:{[n2]:record('Wrong')}}));target.data.set('text/html',new XMLSerializer().serializeToString(carrier));target.plugin.props.handlePaste(target.view,target.event,copied);assert.equal(target.errors.length,2);assert.deepEqual(target.view.state.doc.toJSON(),before);
});
test('cut undo invalidates identity-preserving move while note token remains reusable as copy',()=>{
 let state=clipboardState([p([ref(n1),schema.text('Main')])],model({[n1]:record('Transport')}));state=apply(state,state.tr.setSelection(TextSelection.create(state.doc,1,2)));const harness=clipboardHarness(state), copied=state.selection.content();
 harness.plugin.props.handleDOMEvents.cut(harness.view,harness.event);undo(harness.view.state,tr=>harness.view.dispatch(tr));assert.ok(harness.view.state.doc.attrs.documentModel.notes[n1]);harness.view.dispatch(harness.view.state.tr.setSelection(TextSelection.create(harness.view.state.doc,2)));harness.plugin.props.handlePaste(harness.view,harness.event,copied);
 assert.deepEqual(harness.errors,[]);const ids=N.collectNoteIndex(harness.view.state.doc).notes.map(entry=>entry.noteId);assert.equal(ids.length,2);assert.equal(new Set(ids).size,2);assert.ok(ids.includes(n1));
});

test('policy and explicit delete commands keep stable IDs and each operation undoes whole graph',()=>{
 let state=stateFor([p([ref(n1),ref(n2)])],model({[n1]:record('First'),[n2]:record('Second')}));
 state=run(state,N.setNotePolicy({endnote:{start:27,format:'upperLetter'}},'document'));assert.deepEqual(N.collectNoteIndex(state.doc).notes.map(entry=>entry.label),['AA','AB']);
 const before=state.doc.toJSON();state=run(state,N.deleteNote(n1));assert.equal(N.collectNoteIndex(state.doc).notes[0].noteId,n2);assert.equal(N.collectNoteIndex(state.doc).notes[0].label,'AA');let undone;undo(state,tr=>undone=apply(state,tr));assert.deepEqual(undone.doc.toJSON(),before);
 assert.throws(()=>N.setNotePolicy({endnote:{placement:'sectionEnd'}},'section',sec1)(undone),N.NoteError);assert.throws(()=>N.setNotePolicy({endnote:{start:4000,format:'upperRoman'}})(undone),N.NoteError);
});
test('documentLoad invalidates same-ID clipboard provenance and A5a rejects external footnotes',()=>{
 let state=clipboardState([p([ref(n1),schema.text('Main')])],model({[n1]:record('Transport')}));state=apply(state,state.tr.setSelection(TextSelection.create(state.doc,1,2)));const harness=clipboardHarness(state), copied=state.selection.content();
 harness.plugin.props.handleDOMEvents.cut(harness.view,harness.event);harness.view.dispatch(harness.view.state.tr.setMeta('documentLoad',true));harness.plugin.props.handlePaste(harness.view,harness.event,copied);assert.deepEqual(harness.errors,[]);assert.notEqual(N.collectNoteIndex(harness.view.state.doc).notes[0].noteId,n1);
 const foot=clipboardHarness(clipboardState([p('Target')],model())),{XMLSerializer,DOMParser:XMLParser}=require('@xmldom/xmldom'), carrier=new XMLParser().parseFromString('<div/>','text/xml').documentElement;carrier.setAttribute(N.NOTE_CLIPBOARD_ATTRIBUTE,JSON.stringify({version:1,notes:{[n1]:record('Footnote','footnote')}}));foot.data.set('text/html',new XMLSerializer().serializeToString(carrier));const before=foot.view.state.doc.toJSON();foot.plugin.props.handlePaste(foot.view,foot.event,copied);assert.equal(foot.errors.length,1);assert.match(foot.errors[0],/footnote/);assert.deepEqual(foot.view.state.doc.toJSON(),before);
});
