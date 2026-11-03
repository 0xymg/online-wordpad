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
const entries=Object.fromEntries(Object.entries({tabs:'lib/tab-node.ts',schema:'app/components/editor-schema.ts',pm:'prosemirror-model',state:'prosemirror-state',history:'prosemirror-history'}).map(([key,file])=>[key,bundle(file.startsWith('lib/')||file.startsWith('app/')?path.join(root,file):require.resolve(file))]));
const script=`window.__tabs=(()=>{const modules=${JSON.stringify(modules)},loaded={};function load(i){if(loaded[i])return loaded[i].exports;const module={exports:{}};loaded[i]=module;new Function('require','module','exports',modules[i].code)(name=>load(modules[i].deps[name]),module,module.exports);return module.exports;}return Object.fromEntries(Object.entries(${JSON.stringify(entries)}).map(([key,id])=>[key,load(id)]));})();`;
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage();await page.goto('http://localhost:3107');await page.addScriptTag({content:script});
 const result=await page.evaluate(()=>{
  const {tabs:T,schema:{mySchema:s},pm:P,state:S,history:H}=window.__tabs;const checks=[];
  const check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
  const bold=s.marks.strong.create(),p=s.nodes.paragraph.create(null,[s.text('a\t\tb',[bold])]),code=s.nodes.code_block.create(null,s.text('x\ty'));
  const doc=T.normalizeTabCharacters(s.nodes.doc.create(null,[p,code]));
  check(doc.child(0).textContent==='a\t\tb','normalization preserves consecutive tab text');
  check(doc.child(0).childCount===4&&doc.child(0).child(1).type.name==='tab'&&doc.child(0).child(2).type.name==='tab','each real tab has a distinct editable position');
  check(doc.child(0).child(1).marks[0].type.name==='strong','tab inherits surrounding formatting');
  check(doc.child(1).child(0).isText&&doc.child(1).textContent==='x\ty','code block tabs remain literal text');
  check(T.normalizeTabCharacters(doc)===doc,'normalization is idempotent');
  const wrapper=document.createElement('div');wrapper.append(P.DOMSerializer.fromSchema(s).serializeFragment(doc.content));
  check(wrapper.textContent==='a\t\tbx\ty','HTML serialization retains literal tabs without spaces');
  const reopened=T.normalizeTabCharacters(P.DOMParser.fromSchema(s).parse(wrapper));check(reopened.child(0).content.eq(doc.child(0).content)&&reopened.child(1).eq(doc.child(1)),'HTML parser reopens tab atoms and formatting');
  const copied=doc.slice(1,doc.child(0).nodeSize-1).content.textBetween(0,doc.child(0).content.size,'\n');check(copied==='a\t\tb','plain clipboard serialization keeps exact U+0009 count');
  let state=S.EditorState.create({schema:s,doc:s.nodes.doc.create(null,s.nodes.paragraph.create(null,s.text('ab'))),plugins:[H.history()]});state=state.apply(state.tr.setSelection(S.TextSelection.create(state.doc,2)));
  T.insertTabCharacter(state,tr=>state=state.apply(tr));check(state.doc.textContent==='a\tb','insert command adds one literal tab');H.undo(state,tr=>state=state.apply(tr));check(state.doc.textContent==='ab','insertion undoes without collateral text loss');H.redo(state,tr=>state=state.apply(tr));check(state.doc.textContent==='a\tb','redo restores tab atom');
  const slice=new P.Slice(P.Fragment.from(s.text('x\ty')),0,0);const pasted=T.tabCharactersPlugin().props.transformPasted(slice,{state});check(pasted.content.child(1).type.name==='tab','plain text paste converts tabs to atoms');
  const codeState=S.EditorState.create({schema:s,doc:s.nodes.doc.create(null,code)});const codePaste=T.tabCharactersPlugin().props.transformPasted(slice,{state:codeState});check(codePaste===slice,'code paste does not inject forbidden inline atoms');
  return checks;
 });assert.equal(result.length,13);console.log('PASS '+result.length+' tab node/clipboard/formatting/code-block/history checks.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
