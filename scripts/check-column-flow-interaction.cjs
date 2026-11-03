/* eslint-disable @typescript-eslint/no-require-imports */
/** A3.0 independent interaction gate. No app route, saved document or account. */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edtr-column-interaction-')), entry = path.join(dir, 'entry.js');
 const loader = path.join(dir, 'typescript-loader.cjs'); fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;`);
 const resolve = name => JSON.stringify(require.resolve(name));
 fs.writeFileSync(entry, `
 import {Schema} from ${resolve('prosemirror-model')};
 import {schema as basic} from ${resolve('prosemirror-schema-basic')};
 import {addListNodes} from ${resolve('prosemirror-schema-list')};
 import {EditorState} from ${resolve('prosemirror-state')};
 import {EditorView} from ${resolve('prosemirror-view')};
 import {keymap} from ${resolve('prosemirror-keymap')};
 import {baseKeymap} from ${resolve('prosemirror-commands')};
 import {history,undo,redo} from ${resolve('prosemirror-history')};
 import {columnFlowPrototype} from ${JSON.stringify(path.resolve(process.env.COLUMN_FLOW_PROTOTYPE || 'lib/column-flow-bounds-prototype.ts'))};
 import {tabNodeSpec} from ${JSON.stringify(path.resolve('lib/tab-node.ts'))};
 const nodes=addListNodes(basic.spec.nodes,'paragraph block*','block').addBefore('text','tab',tabNodeSpec);
 const schema=new Schema({nodes,marks:basic.spec.marks}), words=Array.from({length:300},(_,i)=>'word'+i+' '), chunks=[];
 for(let i=0;i<words.length;i+=10){if(i===80)chunks.push(schema.nodes.tab.create());chunks.push(schema.text(words.slice(i,i+10).join(''),i%30===10?[schema.marks.strong.create()]:i%30===20?[schema.marks.em.create()]:[]));}
 const p=schema.nodes.paragraph.create(null,chunks),list=schema.nodes.bullet_list.create(null,[schema.nodes.list_item.create(null,[schema.nodes.paragraph.create(null,schema.text(Array.from({length:140},(_,i)=>'list'+i+' ').join('')))])]);
 const doc=schema.nodes.doc.create(null,[p,list]);
 const view=new EditorView(document.querySelector('#mount'),{state:EditorState.create({doc,plugins:[history(),keymap({'Mod-z':undo,'Mod-Shift-z':redo}),keymap(baseKeymap),...(window.__columnBaseline?[]:[columnFlowPrototype({height:160,gap:24,pageGap:40,columnWidth:260})])]})});
 window.columnInteraction={view,initial:doc.toJSON()};
 `);
 await new Promise((resolveBuild, reject) => webpack({ mode: 'development', entry, output: { path: dir, filename: 'bundle.js' }, resolve: { extensions: ['.js', '.ts'], alias: Object.fromEntries(['prosemirror-model','prosemirror-state','prosemirror-view','prosemirror-transform'].map(name=>[name,require.resolve(name)])) }, module: { rules: [{ test: /\.ts$/, use: loader }] }, devtool: false }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString())) : resolveBuild()));
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
 const report = { scope: 'Isolated A3.0 prototype: genuine mouse/keyboard; synthetic clipboard serialization and composition are not OS clipboard/IME proof', checks: [], errors: [], artifacts: dir };
 const check = (name, ok, detail = {}) => report.checks.push({ name, ok: !!ok, ...detail });
 try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 780 } }), mod = process.platform === 'darwin' ? 'Meta' : 'Control'; page.setDefaultTimeout(10000); page.on('pageerror', e => report.errors.push(e.message));
  const markup = `<style>body{margin:40px}.ProseMirror{width:544px;font:16px/20px Arial;outline:none;white-space:pre-wrap}.ProseMirror p{margin:0;width:544px;padding-right:284px;box-sizing:border-box}.ProseMirror ul{padding-left:25px;margin:0;width:544px;box-sizing:border-box}.ProseMirror li p{width:519px}.ProseMirror ul{pointer-events:none}.ProseMirror ul [data-flow-fragment]{pointer-events:auto}.pm-tab{display:inline-block;width:28px;font-size:0;white-space:pre}</style><div id="mount"></div>`; await page.setContent(markup);
  await page.addScriptTag({ path: path.join(dir, 'bundle.js') });
  await page.waitForFunction(() => document.querySelector('.ProseMirror')?.dataset.flowFragments); await page.waitForTimeout(80);
  const control = await browser.newPage({viewport:{width:1300,height:780}}); await control.setContent(markup+'<style>.ProseMirror ul{pointer-events:auto}</style>'); await control.addScriptTag({content:'window.__columnBaseline=true'}); await control.addScriptTag({path:path.join(dir,'bundle.js')});
  const baselineLineKeys = async (pos,zoom) => {
   await control.bringToFront();await control.evaluate(({pos,zoom})=>{document.body.style.zoom=String(zoom);const c=window.columnInteraction.view.coordsAtPos(pos);window.scrollTo(0,Math.max(0,c.top+scrollY-280));},{pos,zoom});
   const c=await control.evaluate(pos=>{const c=window.columnInteraction.view.coordsAtPos(pos);return{x:c.left+.1,y:(c.top+c.bottom)/2};},pos);await control.mouse.click(c.x,c.y);await control.waitForTimeout(120);
   const read=()=>control.evaluate(()=>{const v=window.columnInteraction.view,selection=window.getSelection();let native=null;try{native=v.posAtDOM(selection.focusNode,selection.focusOffset);}catch{}return{head:v.state.selection.head,native,focused:v.hasFocus(),documentFocused:document.hasFocus(),scrollY};});
   const start=await read();await control.keyboard.press('Home');await control.waitForTimeout(500);const homeState=await read();await control.keyboard.press('End');await control.waitForTimeout(500);const endState=await read();return{start,home:homeState.head,end:endState.head,homeState,endState};
  };
  const key = async value => { await page.keyboard.press(value); await page.waitForTimeout(['Home','End'].includes(value)?500:70); };
  const snapshot = () => page.evaluate(() => { const v = window.columnInteraction.view; return { from: v.state.selection.from, to: v.state.selection.to, anchor: v.state.selection.anchor, head: v.state.selection.head, text: v.state.doc.textContent, json: v.state.doc.toJSON(), revision: +v.dom.dataset.flowRevision, focused: v.hasFocus(), documentFocused:document.hasFocus(), nativeHead: (()=>{const selection=window.getSelection();try{return v.posAtDOM(selection.focusNode,selection.focusOffset);}catch{return null;}})() }; });
  const fragments = () => page.evaluate(() => JSON.parse(window.columnInteraction.view.dom.dataset.flowFragments));
  const point = async (pos, scroll = true) => {
   await page.bringToFront();
   if(scroll)for(let attempt=0;attempt<4;attempt++){
    await page.evaluate(pos=>{const c=window.columnInteraction.view.coordsAtPos(pos);window.scrollTo(0,Math.max(0,c.top+scrollY-280));},pos);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(await page.evaluate(pos=>{const c=window.columnInteraction.view.coordsAtPos(pos);return c.top>=0&&c.bottom<innerHeight;},pos))break;
   }
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   return page.evaluate(pos => { const v = window.columnInteraction.view, c = v.coordsAtPos(pos), x = c.left + .1, y = (c.top + c.bottom) / 2, native = document.caretRangeFromPoint(x, y); let nativePos = null; try { if (native) nativePos = v.posAtDOM(native.startContainer, native.startOffset); } catch {} return { x, y, scrollX,scrollY,nativePos, pmHit: v.posAtCoords({ left: x, top: y })?.pos, source: pos }; }, pos);
  };
  const copied = () => page.evaluate(() => { const v = window.columnInteraction.view, data = new DataTransfer(); v.dom.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, clipboardData: data })); return { plain: data.getData('text/plain'), html: data.getData('text/html'), expected: v.state.doc.textBetween(v.state.selection.from, v.state.selection.to, '\n\n') }; });
  if(process.env.COLUMN_FLOW_FOCUS){
   const pos=Number(process.env.COLUMN_FLOW_FOCUS),p=await point(pos);await page.mouse.click(p.x,p.y);await page.waitForTimeout(120);const before=await snapshot(),baseline=await baselineLineKeys(before.head,1);await page.bringToFront();await key('Home');const home=await snapshot();await key('End');const end=await snapshot();
   const detail={pos,point:p,before:{head:before.head,native:before.nativeHead,focused:before.focused,documentFocused:before.documentFocused},baseline,home:{head:home.head,native:home.nativeHead,focused:home.focused,documentFocused:home.documentFocused},end:{head:end.head,native:end.nativeHead,focused:end.focused,documentFocused:end.documentFocused},viewport:page.viewportSize(),source:await page.evaluate(pos=>window.columnInteraction.view.state.doc.textBetween(pos-15,pos+25),pos)};console.log(JSON.stringify(detail,null,2));check('Focused Home/End platform comparison',home.head===baseline.home&&end.head===baseline.end,detail);return;
  }
  let all = await fragments(); const pSize = await page.evaluate(() => window.columnInteraction.view.state.doc.firstChild.nodeSize);
  check('Single editable source; paragraph spans columns and pages', await page.locator('[contenteditable=true]').count() === 1 && all.some(f => f.column === 1 && f.from < pSize) && all.some(f => f.page > 0 && f.from < pSize), { fragments: all.length });
  check('Layout decorations do not mutate canonical document', JSON.stringify((await snapshot()).json) === JSON.stringify(await page.evaluate(() => window.columnInteraction.initial)));
  for (const zoom of [1, .5]) {
   await control.evaluate(z => { document.body.style.zoom=String(z); }, zoom);
   const zoomRevision=await page.evaluate(z => { const v=window.columnInteraction.view,revision=+v.dom.dataset.flowRevision;document.body.style.zoom=String(z);window.dispatchEvent(new Event('resize'));return revision; }, zoom); await page.waitForFunction(revision=>+window.columnInteraction.view.dom.dataset.flowRevision>revision,zoomRevision,{timeout:1500}).catch(()=>{}); await page.waitForTimeout(80); all = await fragments();
   const choices = [all.find(f => f.column === 1 && f.page === 0 && f.from < pSize), all.find(f => f.page === 1 && f.column === 0 && f.from < pSize), all.find(f => f.from > pSize && f.column === 1), all.find(f => f.from > pSize && f.page >= 1)].filter(Boolean);
   const samples = [...new Map(choices.map(f => [f.from, f])).values()];
   for (const f of samples) {
    const pos = Math.min(f.to - 1, f.from + 2), hit = await point(pos); await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(120); let state = await snapshot();
    check(`Native click maps to source at ${zoom * 100}%`, state.from === state.to && Math.abs(state.head - pos) <= 1 && Math.abs((hit.nativePos ?? Infinity) - pos) <= 1, { fragment: f, hit, selected: state.head });
    check(`PM/native hit agreement at ${zoom * 100}%`, hit.nativePos !== null && Math.abs((hit.pmHit ?? Infinity) - hit.nativePos) <= 1, { hit });
    const before = state.head; await key('ArrowRight'); state = await snapshot();
    check(`Native ArrowRight advances one source position at ${zoom * 100}%`, state.head === before + 1, { before, after: state.head });
    await key('Shift+ArrowRight'); state = await snapshot(); const clip = await copied();
    check(`Native Shift+ArrowRight selects/copies one source character at ${zoom * 100}%`, state.to - state.from === 1 && clip.plain === clip.expected, { selection: [state.from, state.to], clipboard: clip });
    await key('ArrowLeft');
   }
   // Compare platform keys only with matched direction-specific scrollability.
   const keyPositions=[Math.min(all.find(f=>f.page===1&&f.column===0&&f.from<pSize).to-1,all.find(f=>f.page===1&&f.column===0&&f.from<pSize).from+3),all.find(f=>f.from>pSize&&f.column===1).from+3];
   for(const context of ['scrollable','unscrollable']){
    if(context==='scrollable'){
     for(const target of [page,control])await target.evaluate(()=>{const spacer=document.createElement('div');spacer.dataset.keyControlSpacer='true';spacer.style.height='5000px';document.body.appendChild(spacer);});
     const heights=await Promise.all([page,control].map(target=>target.evaluate(()=>document.documentElement.scrollHeight))),maxHeight=Math.max(...heights);
     for(const [index,target] of [page,control].entries())await target.evaluate(delta=>{const spacer=document.querySelector('[data-key-control-spacer]');spacer.style.height=`${5000+delta/Number(document.body.style.zoom||1)}px`;},maxHeight-heights[index]);
    }
    else{for(const target of [page,control])await target.locator('[data-key-control-spacer]').evaluateAll(items=>items.forEach(el=>el.remove()));const height=Math.ceil(Math.max(await page.evaluate(()=>document.documentElement.scrollHeight),await control.evaluate(()=>document.documentElement.scrollHeight)))+100;await page.setViewportSize({width:1300,height});await control.setViewportSize({width:1300,height});await page.waitForTimeout(100);}
    for(const pos of keyPositions){
     await page.bringToFront();await page.evaluate(pos=>{const c=window.columnInteraction.view.coordsAtPos(pos);window.scrollTo(0,Math.max(0,c.top+scrollY-10));},pos);await page.waitForTimeout(80);const candidatePoint=await point(pos,false);await page.mouse.click(candidatePoint.x,candidatePoint.y);await page.waitForTimeout(120);const initial=await snapshot();
     // Both source carets begin at the same viewport Y, away from scroll edges.
     await control.bringToFront();await control.evaluate(({pos,zoom})=>{document.body.style.zoom=String(zoom);const c=window.columnInteraction.view.coordsAtPos(pos);window.scrollTo(0,Math.max(0,c.top+scrollY-10));},{pos:initial.head,zoom});await control.waitForTimeout(80);const cp=await control.evaluate(pos=>{const c=window.columnInteraction.view.coordsAtPos(pos);return{x:c.left+.1,y:(c.top+c.bottom)/2};},initial.head);await control.mouse.click(cp.x,cp.y);await control.waitForTimeout(120);
     const readContext=target=>target.evaluate(()=>{const v=window.columnInteraction.view,max=Math.max(0,document.documentElement.scrollHeight-innerHeight);return{head:v.state.selection.head,focused:v.hasFocus(),documentFocused:document.hasFocus(),scrollY,max,canUp:scrollY>.5,canDown:scrollY<max-.5};});
     for(const name of ['Home','End']){const beforeCandidate=await readContext(page),beforeControl=await readContext(control);await control.keyboard.press(name);await control.waitForTimeout(500);const expected=await readContext(control);await page.bringToFront();await key(name);const actual=await readContext(page);const comparable=Math.abs(beforeCandidate.max-beforeControl.max)<=1&&beforeCandidate.canUp===beforeControl.canUp&&beforeCandidate.canDown===beforeControl.canDown;
      check(`Platform ${name} in matched ${context} context at ${zoom*100}%`,comparable&&Math.abs(actual.head-expected.head)<=1,{pos,comparable,beforeCandidate,beforeControl,expected,actual,source:await page.evaluate(pos=>window.columnInteraction.view.state.doc.textBetween(pos-12,pos+20),pos)});await control.bringToFront();}
    }
    for(const target of [page,control])await target.locator('[data-key-control-spacer]').evaluateAll(items=>items.forEach(el=>el.remove()));await page.setViewportSize({width:1300,height:780});await control.setViewportSize({width:1300,height:780});await page.waitForTimeout(100);
   }
   // Native vertical navigation must cross the column/page source boundary.
   const verticalPairs=[[all.filter(f=>f.page===0&&f.column===0).at(-1),all.find(f=>f.page===0&&f.column===1)], [all.filter(f=>f.page===0&&f.column===1).at(-1),all.find(f=>f.page===1&&f.column===0)]];
   for(const [verticalBefore,verticalAfter]of verticalPairs){if(!verticalBefore||!verticalAfter)continue;
    const label=`${verticalBefore.page}:${verticalBefore.column}→${verticalAfter.page}:${verticalAfter.column} at ${zoom*100}%`,p=await point(Math.min(verticalBefore.to-1,verticalBefore.from+2));await page.mouse.click(p.x,p.y);await page.waitForTimeout(120);const start=await snapshot();
    check(`Native vertical starting click ${label}`,Math.abs(start.head-p.source)<=1&&start.focused&&Math.abs((p.nativePos??Infinity)-p.source)<=1,{point:p,selected:start.head,nativeHead:start.nativeHead,focused:start.focused,documentFocused:start.documentFocused});
    await key('ArrowDown');let state=await snapshot();const downRect=await page.evaluate(()=>window.columnInteraction.view.coordsAtPos(window.columnInteraction.view.state.selection.head)),relativeX=p.x-(verticalBefore.column*284*zoom),expectedX=relativeX+verticalAfter.column*284*zoom;
    check(`Native ArrowDown follows source preserving column-relative X ${label}`,state.head>=verticalAfter.from&&state.head<=verticalAfter.to&&Math.abs(downRect.left-expectedX)<12*zoom,{expectedLine:[verticalAfter.from,verticalAfter.to],actual:state.head,expectedX,actualX:downRect.left,start:{point:p,head:start.head,nativeHead:start.nativeHead}});
    const q=await point(Math.min(verticalAfter.to-1,verticalAfter.from+2));await page.mouse.click(q.x,q.y);await page.waitForTimeout(120);await key('ArrowUp');state=await snapshot();
    check(`Native ArrowUp follows preceding source line ${label}`,state.head>=verticalBefore.from&&state.head<=verticalBefore.to,{expectedLine:[verticalBefore.from,verticalBefore.to],actual:state.head,startPoint:q});
    const shiftPoint=await point(p.source);await page.mouse.click(shiftPoint.x,shiftPoint.y);await page.waitForTimeout(120);const anchor=(await snapshot()).head;await key('Shift+ArrowDown');state=await snapshot();const clip=await copied();
    check(`Native Shift+ArrowDown preserves anchor ${label}`,state.anchor===anchor&&state.head>=verticalAfter.from&&state.head<=verticalAfter.to&&clip.plain===clip.expected,{anchor,actualAnchor:state.anchor,head:state.head,expectedLine:[verticalAfter.from,verticalAfter.to],clipboard:clip});
    const reversePoint=await point(Math.min(verticalAfter.to-1,verticalAfter.from+2));await page.mouse.click(reversePoint.x,reversePoint.y);await page.waitForTimeout(120);const reverseAnchor=(await snapshot()).head;await key('Shift+ArrowUp');state=await snapshot();const reverseClip=await copied();check(`Native Shift+ArrowUp preserves anchor ${label}`,state.anchor===reverseAnchor&&state.head>=verticalBefore.from&&state.head<=verticalBefore.to&&reverseClip.plain===reverseClip.expected,{anchor:reverseAnchor,actualAnchor:state.anchor,head:state.head,expectedLine:[verticalBefore.from,verticalBefore.to],clipboard:reverseClip});await key('Shift+ArrowDown');state=await snapshot();check(`Reverse Shift navigation returns to its anchor ${label}`,state.anchor===reverseAnchor&&Math.abs(state.head-reverseAnchor)<=1,{anchor:reverseAnchor,actualAnchor:state.anchor,head:state.head});
   }
   // Genuine pointer drag across the reading-order discontinuity in screen Y.
   const beforeColumn = all.filter(f => f.page === 0 && f.column === 0).at(-1), afterColumn = all.find(f => f.page === 0 && f.column === 1);
   if (beforeColumn && afterColumn) {
    const from = Math.min(beforeColumn.to - 1, beforeColumn.from + 2), to = Math.min(afterColumn.to - 1, afterColumn.from + 4); await page.bringToFront(); await page.evaluate(()=>window.scrollTo(0,0)); const a = await point(from,false), b = await point(to,false);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(100); const downSelection=await snapshot(); await page.mouse.move(b.x, b.y, { steps: 30 }); await page.mouse.up(); await page.waitForTimeout(60); const s = await snapshot(), clip = await copied();
    check(`Native drag across columns preserves source order at ${zoom * 100}%`, Math.abs(s.from - from) <= 1 && Math.abs(s.to - to) <= 1 && clip.plain === clip.expected, { expected: [from, to], actual: [s.from, s.to], startHit:a,endHit:b,downSelection:{anchor:downSelection.anchor,head:downSelection.head,nativeHead:downSelection.nativeHead}, clipboard: clip });
    check(`Clipboard excludes fragment offsets/duplicate content at ${zoom * 100}%`, !/data-flow-fragment|position:\s*relative|top:\s*-|left:\s*284/.test(clip.html), { html: clip.html });
   }
  }
  await page.evaluate(() => { document.body.style.zoom = '1';window.dispatchEvent(new Event('resize')); }); await page.waitForTimeout(100);
  // Native navigation through the actual tab atom and mark boundary, not a setSelection transaction.
  const tabPos = await page.evaluate(() => { let found = null; window.columnInteraction.view.state.doc.descendants((n, p) => { if (n.type.name === 'tab') found = p; }); return found; });
  if (tabPos !== null) { const p = await point(tabPos-1); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); const before = await snapshot(); await key('ArrowRight'); const atTab = await snapshot();await key('ArrowRight');const after=await snapshot(); check('Native ArrowRight crosses one literal tab atom',before.head===tabPos-1&&atTab.head===tabPos&&after.head===tabPos+1, { tabPos,point:p,before:before.head,nativeBefore:before.nativeHead,atTab:atTab.head,after:after.head }); }
  // Enter/Backspace and undo occur at a shifted long-paragraph line.
  all = await fragments(); const editFragment = all.find(f => f.column === 1 && f.from < pSize), editPoint = await point(editFragment.from + 3); await page.mouse.click(editPoint.x, editPoint.y); const beforeEdit = await snapshot();
  await key('Enter'); await page.waitForTimeout(80); const split = await snapshot(); await key('Backspace'); await page.waitForTimeout(80); const joined = await snapshot();
  check('Native Enter/Backspace retains content at shifted paragraph', split.text === beforeEdit.text && joined.text === beforeEdit.text && JSON.stringify(joined.json) === JSON.stringify(beforeEdit.json));
  await key(mod + '+z'); await key(mod + '+z'); await page.waitForTimeout(80); check('Undo returns exact canonical document', JSON.stringify((await snapshot()).json) === JSON.stringify(beforeEdit.json));
  // Hold a genuine drag at the viewport edge; record the browser's autoscroll.
  all=await fragments();const scrollFragment=all.find(f=>f.page===1&&f.column===0);
  if(scrollFragment){const p=await point(scrollFragment.from+2),beforeScroll=await page.evaluate(()=>scrollY);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,778,{steps:20});await page.waitForTimeout(550);const afterScroll=await page.evaluate(()=>scrollY),selection=await snapshot();await page.mouse.up();check('Native drag autoscrolls at viewport edge',afterScroll>beforeScroll&&selection.from<selection.to,{beforeScroll,afterScroll,selection:[selection.from,selection.to]});}
  // Synthetic composition lifecycle is useful regression coverage, NOT an OS IME test.
  const compositionPoint = await point(editFragment.from + 3); await page.mouse.click(compositionPoint.x, compositionPoint.y); const compositionBefore = await snapshot();
  const compositionStart = await page.evaluate(() => { const v = window.columnInteraction.view; v.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })); window.columnInteraction.composingNode=window.getSelection()?.anchorNode;window.columnInteraction.composingParent=window.columnInteraction.composingNode?.parentNode;return v.composing; });
  await page.keyboard.insertText('漢'); await page.waitForTimeout(40); const during = await page.evaluate(() => ({ composing: window.columnInteraction.view.composing, text: window.columnInteraction.view.state.doc.textContent,activeNodeConnected:window.columnInteraction.composingNode?.isConnected,sameParent:window.columnInteraction.composingNode?.parentNode===window.columnInteraction.composingParent }));
  await page.evaluate(() => window.columnInteraction.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '漢' }))); await page.waitForTimeout(140); const compositionAfter = await snapshot();
  check('SYNTHETIC composition inserts once and ends (not OS IME proof)', compositionStart && during.composing && during.activeNodeConnected && during.sameParent && compositionAfter.text.length === compositionBefore.text.length + 1 && !await page.evaluate(() => window.columnInteraction.view.composing), { compositionStart, during, after: compositionAfter.text.length });
  await page.screenshot({ path: path.join(dir, 'prototype.png'), fullPage: true });
  check('No browser runtime errors', report.errors.length === 0, { errors: report.errors });
 } finally { await browser.close(); fs.writeFileSync(path.join(dir, 'interaction-report.json'), JSON.stringify(report, null, 2)); }
 const failed = report.checks.filter(c => !c.ok); console.log(JSON.stringify({ passed: report.checks.length - failed.length, failed: failed.length, failures: failed, artifacts: dir }, null, 2)); if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
