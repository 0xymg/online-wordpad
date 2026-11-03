/* eslint-disable @typescript-eslint/no-require-imports */
/* Pure region-flow checks: no app state or browser. */
const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),path=require('node:path');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file);const file=path.resolve('lib/column-flow.ts'),source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(source,file);const {solveColumnFlow,columnPageBreakPositions,columnRelativeXDelta,setColumnFlowSnapshot,columnContentGeometryAtPos,resolveColumnTabGeometry}=mod.exports;
const geometry={width:6000,height:3000,margins:{top:300,bottom:300,left:300,right:300}},cols=(count=2)=>({kind:'equal',count,space:360,separator:true}),unit=(i,height=20)=>({from:i,to:i+1,height,kind:'line'}),sec=(id,units,more={})=>({id,geometry,start:'nextPage',columns:cols(),flowDirection:'ltr',units,...more});
let flow=solveColumnFlow([sec('a',Array.from({length:20},(_,i)=>unit(i)))]);assert.equal(flow.complete,true);assert.equal(flow.pages.length,2);assert.deepEqual(flow.fragments.map(f=>f.columnIndex),[...Array(8).fill(0),...Array(8).fill(1),...Array(4).fill(0)]);assert.equal(flow.regions[0].columns[1].x-flow.regions[0].columns[0].x,192);
flow=solveColumnFlow([sec('a',Array.from({length:7},(_,i)=>unit(i)))]);assert.equal(flow.pages.length,1);assert.deepEqual(flow.fragments.map(f=>f.columnIndex),Array(7).fill(0),'final region is not balanced');assert.equal(flow.regions[0].activeColumns,1,'short final region has no inter-column separator');
flow=solveColumnFlow([sec('a',Array.from({length:7},(_,i)=>unit(i))),sec('b',[unit(7)],{start:'continuous',columns:cols(1)})]);assert.equal(flow.complete,true);assert.equal(flow.pages.length,1);assert.deepEqual(flow.fragments.slice(0,7).map(f=>f.columnIndex),[0,0,0,0,1,1,1]);assert.ok(Math.abs(flow.regions[0].bandHeight-80)<0.02);assert.ok(Math.abs(flow.regions[1].bandTop-(20+80))<0.02);
flow=solveColumnFlow([sec('a',[unit(0),{from:1,to:2,height:0,kind:'column_break'},unit(2),{from:3,to:4,height:0,kind:'page_break'},unit(4),{from:5,to:6,height:0,kind:'column_break'}])]);assert.equal(flow.pages.length,2);assert.deepEqual(flow.fragments.map(f=>[f.pageIndex,f.columnIndex]),[[0,0],[0,1],[1,0]],'trailing break opens no page');
flow=solveColumnFlow([sec('a',[unit(0),{from:1,to:2,height:0,kind:'column_break'}],{columns:cols(1)})]);assert.equal(flow.complete,true);assert.equal(flow.pages.length,2,'Word one-column terminal break produces a blank page');assert.equal(flow.fragments.length,1);
flow=solveColumnFlow([sec('a',[unit(0),{from:1,to:2,height:0,kind:'column_break'}])]);assert.equal(flow.pages.length,1);assert.equal(flow.regions[0].activeColumns,2,'terminal break enters next column even when it stays empty');
flow=solveColumnFlow([sec('a',[unit(0),{from:1,to:2,height:0,kind:'column_break'},unit(2),{from:3,to:4,height:0,kind:'column_break'}])]);assert.equal(flow.complete,true);assert.equal(flow.pages.length,2,'Word last-of-two terminal break produces a blank page');
flow=solveColumnFlow([sec('a',[unit(0),{from:1,to:2,height:0,kind:'column_break'},{from:2,to:3,height:0,kind:'column_break'}])]);assert.equal(flow.complete,true);assert.equal(flow.pages.length,2,'consecutive trailing column breaks advance before checking the end');
flow=solveColumnFlow([sec('a',[unit(0),{from:1,to:2,height:0,kind:'page_break'}],{columns:cols(1)})]);assert.equal(flow.complete,true);assert.equal(flow.pages.length,1,'Word one-column terminal page break creates no page');
flow=solveColumnFlow([sec('a',[unit(0),{from:1,to:2,height:0,kind:'page_break'}])]);assert.equal(flow.complete,false);assert.equal(flow.diagnostics[0].code,'unverified-trailing-break');
flow=solveColumnFlow([sec('a',[unit(0),unit(1)],{flowDirection:'rtl',columns:cols(3)})]);assert.ok(flow.regions[0].columns[0].x>flow.regions[0].columns[2].x);assert.equal(flow.fragments[0].columnIndex,0);
flow=solveColumnFlow([sec('a',[unit(0)],{columns:{kind:'preserved',reason:'unequal'}})]);assert.equal(flow.complete,false);assert.equal(flow.diagnostics[0].code,'unsupported-columns');
flow=solveColumnFlow([sec('a',[unit(0)]),sec('b',[unit(1)],{geometry:{...geometry,width:9000}})]);assert.equal(columnRelativeXDelta(flow,flow.fragments[0],flow.fragments[1]),-100,'mixed-paper caret x includes sheet centering');
const band=(groupIndex,height)=>({from:100+groupIndex,to:101+groupIndex,height,kind:'table',table:{tablePos:100,groupIndex,headerHeight:30,band:{top:groupIndex*100,bottom:groupIndex*100+height,continuation:false,headerHeight:0,cells:[]}}});flow=solveColumnFlow([sec('table',[band(0,30),band(1,100),band(2,100)])]);assert.equal(flow.complete,true);assert.equal(flow.fragments[2].columnIndex,1);assert.equal(flow.fragments[2].table.repeatedHeaderHeight,30);assert.equal(flow.fragments[2].rect.y,flow.regions[0].columns[1].y+30,'header space reserved before continuation');
const headerBand={...band(0,30),table:{...band(0,30).table,headerGroup:true}},bodyBand=n=>band(n,20);flow=solveColumnFlow([sec('table',[unit(0,90),headerBand,bodyBand(1),bodyBand(2),bodyBand(3)])]);assert.equal(flow.complete,true);assert.deepEqual(flow.fragments.slice(1).map(f=>f.columnIndex),[0,0,0,1],'fine bands use residual column space before continuing');assert.equal(flow.fragments.at(-1).table.repeatedHeaderHeight,30);flow=solveColumnFlow([sec('table',[unit(0,120),headerBand,bodyBand(1)])]);assert.deepEqual(flow.fragments.slice(1).map(f=>f.columnIndex),[1,1],'initial header stays with its first body band');
// Adjacent paragraphs share their larger margin within a column. Keep/ widow
// policies inspect the same effective space; a region break restores before.
const para=(block,index=0,count=1,keepLines=false)=>({block,index,count,keepNext:false,keepLines,widowControl:true,pageBreakBefore:false});
const before=[{...unit(0,30),trailingMargin:10,paragraph:para(0)},{...unit(1,44),offsetY:24,leadingMargin:24,paragraph:para(1,0,1,true)}];
flow=solveColumnFlow([sec('collapse',before)]);
assert.equal(flow.fragments[1].rect.y,64,'24px before and 10px after overlap by 10px');
assert.equal(flow.fragments[1].rect.height,20);
assert.equal(before[1].offsetY,24,'natural units stay unchanged');
assert.equal(flow.regions[0].paintHeight,64,'separator stops at maximum occupied extent');
assert.equal(flow.regions[0].bandHeight,160,'flow capacity stays unchanged');
flow=solveColumnFlow([sec('collapse',[{...unit(0,135),trailingMargin:10,paragraph:para(0)},before[1]])]);
assert.equal(flow.fragments[1].columnIndex,1);
assert.equal(flow.fragments[1].rect.y,44,'before spacing is not collapsed across columns');
const widowLines=[{...unit(1,39),offsetY:24,leadingMargin:24,paragraph:para(1,0,2)},{...unit(2,15),paragraph:para(1,1,2)}];
flow=solveColumnFlow([sec('collapse',[{...unit(0,110),trailingMargin:10,paragraph:para(0)},...widowLines])]);
assert.deepEqual(flow.fragments.map(f=>f.columnIndex),[0,0,0],'widow logic accounts for collapsed spacing');
// A paragraph's last line can fit even if only its after-spacing crosses the
// physical column edge. Widow/keep decisions and emitted geometry must agree.
const policy=(i,keepLines=false)=>({block:10,index:i,count:2,keepNext:false,keepLines,widowControl:true,pageBreakBefore:false});
for (const keepLines of [false,true]) {
 const lines=[{...unit(1,15),paragraph:policy(0,keepLines)},{...unit(2,25),trailingMargin:10,paragraph:policy(1,keepLines)}];
 flow=solveColumnFlow([sec('after',[unit(0,125),...lines,unit(3,10)])]);
 assert.deepEqual(flow.fragments.map(f=>f.columnIndex),[0,0,0,1]);
 assert.equal(flow.fragments[2].rect.height,20,'only the overflowing after-spacing is trimmed');
 assert.equal(lines[1].height,25,'measurement remains unchanged');
 flow=solveColumnFlow([sec('after',[unit(0,135),...lines,unit(3,10)])]);
 assert.deepEqual(flow.fragments.map(f=>f.columnIndex),[0,1,1,1],'glyph height cannot be trimmed');
}
flow=solveColumnFlow([sec('after',[unit(0,30),{...unit(1,170),trailingMargin:20}])]);
assert.equal(flow.complete,true,'after-spacing is retrimmed after moving to a fresh column');
assert.equal(flow.fragments[1].columnIndex,1);
assert.equal(flow.fragments[1].rect.height,160);
assert.equal(flow.fragments[1].trailingMargin,10);
// Border paint must subtract the retained margin, not the original margin.
const {schema}=require('prosemirror-schema-basic');
const {buildColumnDecorations}=require(path.resolve('lib/column-flow-decorations.ts'));
const paragraphDoc=schema.nodes.doc.create(null,[schema.nodes.paragraph.create(null,schema.text('x'))]);
const bordered={from:1,to:2,kind:'line',height:170,trailingMargin:20,sourceBlock:0,sourceTop:0};
const borderSection=sec('border',[bordered]);
const borderFlow=solveColumnFlow([borderSection]);
const makeElement=()=>({style:{cssText:''},children:[],setAttribute(){},appendChild(child){this.children.push(child)},ownerDocument:global.document});
global.document={createElement:makeElement};
const rendered=buildColumnDecorations(paragraphDoc,{complete:true,diagnostics:[],sections:[borderSection],tables:[],blocks:[{pos:0,from:1,to:2,top:0,left:0,width:100,height:150,paddingLeft:0,paddingRight:0,marginBottom:20,borderBottom:'1px solid black',borderBottomWidth:1,textblock:true}]},borderFlow);
assert.equal(rendered.complete,true);
assert.match(rendered.overlays[0].children[0].style.cssText,/top:169px;/,'border remains at the content edge when after-spacing is clipped');
const twoDoc=schema.nodes.doc.create(null,[schema.nodes.paragraph.create(null,schema.text('x')),schema.nodes.paragraph.create(null,schema.text('y'))]);
const borderedBefore={...before[0],from:1,to:2,sourceBlock:0,sourceTop:0}, nextBefore={...before[1],from:4,to:5,sourceBlock:3,sourceTop:30};
const twoSection=sec('two',[borderedBefore,nextBefore]), twoFlow=solveColumnFlow([twoSection]);
const measuredBlock={pos:0,from:1,to:2,top:0,left:0,width:100,height:20,paddingLeft:0,paddingRight:0,marginBottom:10,borderBottom:'1px solid black',borderBottomWidth:1,textblock:true};
const twoRender=buildColumnDecorations(twoDoc,{complete:true,diagnostics:[],sections:[twoSection],tables:[],blocks:[measuredBlock,{...measuredBlock,pos:3,from:4,to:5,top:30,marginBottom:0,borderBottomWidth:0}]},twoFlow);
assert.equal(twoRender.complete,true);
assert.match(twoRender.overlays[0].children[0].style.cssText,/top:39px;/,'collapsing the following margin does not move the previous border');

flow=solveColumnFlow([sec('a',[unit(0,200)])]);assert.equal(flow.complete,false);assert.equal(flow.diagnostics[0].code,'unit-exceeds-region');
const keep=(i)=>({...unit(i,40),paragraph:{block:10,index:i-1,count:2,keepNext:false,keepLines:true,widowControl:true,pageBreakBefore:false}});flow=solveColumnFlow([sec('a',[unit(0,100)],{columns:cols(1)}),sec('b',[keep(1),keep(2)],{start:'continuous',columns:cols(1)})]);assert.equal(flow.pages.length,2,'kept paragraph advances from partial continuous band to full page');assert.ok(flow.fragments.slice(1).every(f=>f.pageIndex===1));
flow=solveColumnFlow([sec('a',[unit(0,100)]),sec('b',[unit(1,140)],{start:'continuous'})]);assert.equal(flow.complete,true);assert.equal(flow.pages.length,2,'unit moves to fresh full-height region when residual band is too short');
const boundaryDoc={content:{size:100},nodeAt:p=>p===10?{isTextblock:true}:null,resolve:()=>({depth:0})};const boundaryLayout={pages:[{},{}],fragments:[{pageIndex:1,from:11,to:20,sourceBlock:10}]};assert.deepEqual(columnPageBreakPositions(boundaryDoc,boundaryLayout),[10]);boundaryLayout.fragments[0].from=15;assert.deepEqual(columnPageBreakPositions(boundaryDoc,boundaryLayout),[15],'mid-paragraph page split remains an internal position');
const doc={},view={isDestroyed:false,state:{doc},dom:{dispatchEvent:()=>true,parentElement:{getBoundingClientRect:()=>({left:10})},getBoundingClientRect:()=>({width:400})},posAtDOM:()=>0};global.getComputedStyle=()=>({width:'400px'});flow=solveColumnFlow([sec('a',[unit(0)])]);assert.equal(setColumnFlowSnapshot(view,doc,flow),true);const geo=columnContentGeometryAtPos(view,0);assert.equal(geo.originClientX,30);assert.equal(resolveColumnTabGeometry(view,0,{},{}).availableWidthTwips,geo.availableWidthTwips);view.state.doc={};assert.equal(columnContentGeometryAtPos(view,0),null,'stale document must not reuse geometry');assert.deepEqual(resolveColumnTabGeometry(view,0,{}, {originClientX:123}),{originClientX:123});assert.equal(setColumnFlowSnapshot(view,doc,flow),false);
class FakeElement{};global.HTMLElement=FakeElement;const paragraph=new FakeElement();view.nodeDOM=()=>paragraph;view.state.doc=doc;global.getComputedStyle=element=>element===paragraph?{direction:'ltr',marginLeft:'0px',marginRight:'0px'}:{width:'400px'};flow=solveColumnFlow([sec('rtl',[{...unit(0),sourceBlock:0,sourceLeft:20,sourceWidth:140,sourceMarginLeft:10,sourceMarginRight:5}],{flowDirection:'rtl'})]);assert.ok(setColumnFlowSnapshot(view,doc,flow));const physicalLeft=10+flow.regions[0].columns[0].x;const ltr=resolveColumnTabGeometry(view,0,{}, {direction:'ltr'}),rtl=resolveColumnTabGeometry(view,0,{}, {direction:'rtl'});assert.equal(ltr.direction,'ltr');assert.equal(ltr.originClientX,physicalLeft+10);assert.equal(ltr.availableWidthTwips,2250);assert.equal(rtl.originClientX,physicalLeft+165);assert.equal(rtl.availableWidthTwips,2175);assert.equal(columnContentGeometryAtPos(view,0).direction,'ltr','section RTL must not flip LTR paragraph tabs');
console.log('PASS typed column solver: sequential flow, continuous balancing, breaks, RTL, diagnostics and residual-page advance');
