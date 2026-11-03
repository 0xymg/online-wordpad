/* eslint-disable @typescript-eslint/no-require-imports */
/** Independent printed target geometry, including duplicate off-page clones. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {webpack}=require('next/dist/compiled/webpack/webpack'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edtr-pdf-targets-')),entry=path.join(dir,'entry.ts'),loader=path.join(dir,'loader.cjs');
 fs.writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText`);
 fs.writeFileSync(entry,`import {printedLinkTargets} from ${JSON.stringify(path.resolve('lib/pdf-link-targets.ts'))};window.targets=()=>Array.from(printedLinkTargets(Array.from(document.querySelectorAll('section')),new Set(['heading','bookmark','empty','bookmark-empty','bookmark-end','outside-only','note-owner:note','note-body:note','note-body:end'])));`);
 await new Promise((ok,no)=>webpack({mode:'development',entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.ts','.js']},module:{rules:[{test:/\.ts$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?no(e||Error(s.toString())):ok()));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:1200}});
  await page.setContent(`<style>body{margin:0}section{position:relative;width:600px;height:400px;overflow:hidden}p{position:absolute;left:80px;top:90px;margin:0;font:16px/24px Arial}h1{position:absolute;left:80px;top:120px;font:24px/30px Arial}.boundary{font-size:0}.pm-endnote-separator{display:block;height:20px}</style><section><h1 data-edtr-target-id="heading" style="top:460px">OFF_PAGE</h1><p style="top:460px"><span class="boundary" data-edtr-bookmark="start" data-edtr-target-id="bookmark-empty"></span><span class="boundary" data-edtr-bookmark="start" data-edtr-target-id="bookmark-end"></span></p><p style="top:-50px"><span class="boundary" data-edtr-bookmark="start" data-edtr-target-id="outside-only"></span></p></section><section><h1 data-edtr-target-id="heading"><span>ACTUAL_HEADING</span></h1><p style="top:200px">before <span class="boundary" data-edtr-bookmark="start" data-edtr-target-id="bookmark"></span><b>BOOKMARK_TEXT</b></p><p style="top:230px" data-edtr-target-id="empty"><br></p><p style="top:260px"><span data-edtr-note-reference data-note-id="note"><sup>1</sup></span></p><p style="top:290px" class="pm-footnote-line" id="edtr-note-note" data-note-id="note">FOOTNOTE_BODY</p><p style="top:320px" data-note-owner-id="end" data-note-block="0"><span class="pm-endnote-separator"> </span>ENDNOTE_BODY</p><p style="top:20px"><span class="boundary" data-edtr-bookmark="start" data-edtr-target-id="bookmark-empty"></span><br></p><p style="top:55px">END_OF_PARAGRAPH<span class="boundary" data-edtr-bookmark="start" data-edtr-target-id="bookmark-end"></span></p><p data-edtr-target-id="forged">IGNORE_UNREGISTERED</p></section>`);
  await page.addScriptTag({path:path.join(dir,'bundle.js')});
  const result=await page.evaluate(()=>{
   const actual=Object.fromEntries(window.targets());const expected={};
   for(const [id,selector] of [['heading','h1 span'],['bookmark','b'],['note-owner:note','sup'],['note-body:note','.pm-footnote-line'],['note-body:end','[data-note-owner-id]']]){
    const el=document.querySelector(selector),range=document.createRange();if(id==='note-body:end')range.selectNode(el.lastChild);else range.selectNodeContents(el);const r=range.getBoundingClientRect(),s=el.closest('section').getBoundingClientRect();expected[id]={x:r.left-s.left,y:r.top-s.top};
   }const boundaryHeights={};for(const id of ['bookmark-empty','bookmark-end']){const el=document.querySelectorAll('[data-edtr-target-id="'+id+'"]')[1],r=el.getBoundingClientRect(),sheet=el.closest('section').getBoundingClientRect();expected[id]={x:r.left-sheet.left,y:r.top-sheet.top};boundaryHeights[id]=r.height;}return{actual,expected,boundaryHeights};
  });
  assert.deepEqual(Object.keys(result.actual).sort(),['heading','bookmark','empty','bookmark-empty','bookmark-end','note-owner:note','note-body:note','note-body:end'].sort());
  for(const [id,p] of Object.entries(result.actual)){assert.equal(p.pageIndex,1,id+' resolves physical second page');if(result.expected[id]){assert.ok(Math.abs(p.x-result.expected[id].x)<.01,id+' printed x');assert.ok(Math.abs(p.y-result.expected[id].y)<.01,id+' printed y');}}
  assert.deepEqual(result.boundaryHeights,{'bookmark-empty':0,'bookmark-end':0},'real zero-font bookmark spans must exercise the zero-height fallback');
  fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(result,null,2));
  console.log('PASS printed headings/bookmarks/empty targets/note owners/footnotes/endnotes, source identity allowlist, correct physical page despite off-page duplicate clones. '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
