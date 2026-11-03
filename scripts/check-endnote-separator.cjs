/* eslint-disable @typescript-eslint/no-require-imports */
/** Native endnote separator is derived UI, participates in both flow engines,
 * and never enters canonical note content or searchable PDF text. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edtr-endnote-separator-'));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  for(const columns of [1,2]) {
   const ys={};
   for(const profile of ['default','none','authored','section','list']) {
    console.log('Checking separator',columns,profile);
    const sec='sec_'+'1'.repeat(32), ids=['a','b'].map(c=>'nte_'+c.repeat(32));
    const numbering={restart:'continuous',start:1,format:'decimal'};
    const notes=Object.fromEntries(ids.map((id,i)=>[id,{kind:'endnote',body:{type:'doc',content:[{type:'paragraph',attrs:{layoutStyle:'color:#cc0000',paragraphFormat:{alignment:'center',left:360}},content:[{type:'text',text:'END_BODY_'+i}]}]},...(profile==='authored'?{}:{presentation:{version:1,bodyReference:null,separators:{separator:['section','list'].includes(profile)?'default':profile,continuationSeparator:'default'}}})}]));
    if(profile==='list') notes[ids[0]].body.content=[{type:'bullet_list',content:[{type:'list_item',content:[{type:'paragraph',attrs:{layoutStyle:'color:#cc0000',paragraphFormat:{alignment:'center',left:360}},content:[{type:'text',text:'END_BODY_0'}]},{type:'bullet_list',content:[{type:'list_item',content:[{type:'paragraph',content:[{type:'text',text:'NESTED_LIST_BODY'}]}]}]}]}]}];
    const model={version:7,sources:{},bibliography:{style:'apa7',locale:'en-US',includeUncited:false},id:'doc_'+'a'.repeat(32),finalSectionId:sec,sections:{[sec]:{page:{width:12240,height:15840,margins:{top:1440,right:1440,bottom:1440,left:1440}},start:'nextPage',numbering:{},running:{},columns:{kind:'equal',count:columns,space:720,separator:false},flowDirection:'ltr'}},notePolicy:{footnote:{...numbering,placement:'pageBottom'},endnote:{...numbering,placement:'documentEnd'}},notes};
    const firstSec='sec_'+'2'.repeat(32);
    if(profile==='section'){model.sections[firstSec]=structuredClone(model.sections[sec]);model.notePolicy.endnote.placement='sectionEnd';}
    const content=profile==='section'?`<p data-edtr-section-end="${firstSec}">OWNER <span data-edtr-note-reference="true" data-note-id="${ids[0]}">…</span></p><p>SECOND <span data-edtr-note-reference="true" data-note-id="${ids[1]}">…</span></p>`:`<p>OWNER <span data-edtr-note-reference="true" data-note-id="${ids[0]}">…</span> SECOND <span data-edtr-note-reference="true" data-note-id="${ids[1]}">…</span></p>`;
    const enc=x=>x.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    const file=path.join(dir,`${columns}-${profile}.html`);
    await fs.writeFile(file,`<div data-edtr-model="${enc(JSON.stringify(model))}">${content}</div>`);
    const context=await browser.newContext({viewport:{width:1400,height:1100},acceptDownloads:true}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.BASE_URL||'http://localhost:3120')+'/pad');await page.locator('.editor-shell .ProseMirror').waitFor();await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({state:'hidden'});await page.locator('input[type=file][accept*=".docx"]').setInputFiles(file);
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror [data-note-owner-id]').length===2&&!document.querySelector('[data-note-layout-error]')).catch(async e=>{await page.screenshot({path:path.join(dir,`${columns}-${profile}-failure.png`),fullPage:true});console.error('failure',dir,await page.locator('body').innerText());throw e});
    if(columns===2&&(['default','section','list'].includes(profile)))await page.waitForSelector('.pm-endnote-separator-overlay');
    await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export',exact:true}).hover();
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.getByRole('menuitem',{name:'PDF (.pdf)',exact:true}).click()]);
    const pdf=path.join(dir,`${columns}-${profile}.pdf`);await download.saveAs(pdf);
    const data=await page.evaluate(()=>{const root=document.querySelector('.editor-shell .ProseMirror'), first=root.querySelector('[data-note-owner-id]'),walker=document.createTreeWalker(first,NodeFilter.SHOW_TEXT);let text;while(walker.nextNode())if(walker.currentNode.data.includes('END_BODY_0')){text=walker.currentNode;break}const range=document.createRange();range.selectNodeContents(text);const box=range.getBoundingClientRect(), parent=root.parentElement.getBoundingClientRect(), scale=parent.width/parseFloat(getComputedStyle(root.parentElement).width);const rule=document.querySelector('.pm-endnote-separator-overlay')||root.querySelector('.pm-endnote-separator-rule'),ruleBox=rule?.getBoundingClientRect();return {ruleColor:rule&&getComputedStyle(rule).color,ruleX:ruleBox&&(ruleBox.left-parent.left)/scale,bodyColor:getComputedStyle(text.parentElement).color,y:(box.top-parent.top)/scale,widgets:root.querySelectorAll('.pm-endnote-separator').length,overlays:document.querySelectorAll('.pm-endnote-separator-overlay').length,model:root.pmViewDesc.node.attrs.documentModel,blocks:[...root.querySelectorAll('[data-note-owner-id]')].map(el=>el.textContent)};});
    const extracted=execFileSync(process.env.PDF_PYTHON||'/Users/Yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',['-c','import pypdf,sys;print("\\n".join(x.extract_text() or "" for x in pypdf.PdfReader(sys.argv[1]).pages))',pdf],{encoding:'utf8'});
    for(const token of ['END_BODY_0','END_BODY_1'])assert.equal(extracted.split(token).length-1,1,`${columns}/${profile}/${token}`);
    if(['default','section','list'].includes(profile)){assert.equal(data.bodyColor,'rgb(204, 0, 0)','test body color');assert.equal(data.ruleColor,'rgb(0, 0, 0)','separator does not inherit body color');assert.ok(Math.abs(data.ruleX-96)<2,`separator stays on column edge: ${data.ruleX}`)}assert.equal(data.widgets,profile==='section'?2:['default','list'].includes(profile)?1:0,`${columns}/${profile} widget count`);assert.equal(data.overlays,columns===2?(profile==='section'?2:['default','list'].includes(profile)?1:0):0,`${columns}/${profile} physical overlay`);
    assert.ok(data.blocks[0].includes('END_BODY_0')&&data.blocks[1].includes('END_BODY_1'));assert.ok(Object.values(data.model.notes).every(record=>!JSON.stringify(record.body).includes('separator')));assert.deepEqual(errors,[]);
    ys[profile]=data.y;await context.close();
   }
   assert.ok(ys.default-ys.none>10,`${columns} column native separator contributes a real line`);
  }
  console.log('PASS native endnote separator: one per scope, none/authored, single/column flow, canonical bodies and searchable PDF; '+dir);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
