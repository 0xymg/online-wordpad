/* eslint-disable @typescript-eslint/no-require-imports */
/** Native endnotes through actual upload, renderer, download and reopen. */
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), JSZip = require('jszip');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edtr-notes-ui-'));
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  const page = await browser.newPage({viewport:{width:1350,height:1050}}); page.setDefaultTimeout(30000);
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto((process.env.BASE_URL||'http://localhost:3120')+'/pad');
  const editor=page.locator('.editor-shell .ProseMirror[contenteditable=true]'); await editor.waitFor();
  await page.locator('.editor-shell > div[aria-hidden=true]').waitFor({state:'hidden'});
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(path.resolve('fixtures/notes/native-endnote-supported.docx'));
  await editor.getByText('ENDNOTE_ANCHOR body and endnote',{exact:false}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.editor-shell [data-note-owner-id]'));
  const snapshot=()=>editor.evaluate(root=>root.pmViewDesc.node.toJSON());
  const check=doc=>{
   assert.equal(doc.attrs.documentModel.version,6); const records=Object.entries(doc.attrs.documentModel.notes); assert.equal(records.length,1);
   const [id,note]=records[0]; assert.equal(note.kind,'endnote');
   const body=JSON.stringify(note.body); for(const type of ['strong','em','tab','hard_break','ordered_list','link']) assert.ok(body.includes('"type":"'+type+'"'),type+' retained');
   const flatten=n=>[n,...(n.content||[]).flatMap(flatten)]; const owners=flatten(doc).filter(n=>n.type==='note_reference'); assert.equal(owners.length,1); assert.equal(owners[0].attrs.noteId,id); assert.equal(owners[0].attrs.cachedLabel,'i');
   const generated=doc.content.filter(n=>n.attrs?.noteOwnerId); assert.ok(generated.length>=3); assert.ok(JSON.stringify(generated).includes('NOTE_LONG_END')); return id;
  };
  const before=await snapshot(),id=check(before); await fs.writeFile(path.join(dir,'import.json'),JSON.stringify(before,null,2));
  await page.screenshot({path:path.join(dir,'endnotes.png'),fullPage:true});
  await page.getByRole('menuitem',{name:'File',exact:true}).click(); await page.getByRole('menuitem',{name:'Export',exact:true}).hover();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('menuitem',{name:'Word (.docx)',exact:true}).click()]);
  const out=path.join(dir,'endnotes-roundtrip.docx'); await download.saveAs(out);
  const zip=await JSZip.loadAsync(await fs.readFile(out)), main=await zip.file('word/document.xml').async('string'), notes=await zip.file('word/endnotes.xml').async('string');
  assert.equal((main.match(/<w:endnoteReference\b/g)||[]).length,1); assert.ok(!main.includes('NOTE_LONG_END')); assert.ok(!main.includes('EDTRNOTE')); assert.match(notes,/NOTE_LONG_END/); assert.match(notes,/<w:numPr/); assert.match(notes,/<w:tab\b/); assert.match(notes,/<w:hyperlink\b/);
  await editor.evaluate(root=>{window.__noteBefore=root.pmViewDesc.node});
  await page.locator('input[type=file][accept*=".docx"]').setInputFiles(out); await page.getByRole('button',{name:'Replace document',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.editor-shell .ProseMirror[contenteditable=true]')?.pmViewDesc.node!==window.__noteBefore);
  await page.waitForFunction(()=>document.querySelector('.editor-shell [data-note-owner-id]'));
  assert.equal(check(await snapshot()),id);
  await page.getByRole('menuitem',{name:'File',exact:true}).click(); await page.getByRole('menuitem',{name:'Export',exact:true}).hover();
  const [pdfDownload]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('menuitem',{name:'PDF (.pdf)',exact:true}).click()]);
  const pdfPath=path.join(dir,'endnotes.pdf'); await pdfDownload.saveAs(pdfPath);
  const {execFileSync}=require('node:child_process');
  const pdf=JSON.parse(execFileSync(process.env.PDF_PYTHON||'python3',['-c',"from pypdf import PdfReader; import json,sys; d=PdfReader(sys.argv[1]); print(json.dumps({'text':' '.join(p.extract_text() for p in d.pages),'links':[str(a.get_object().get('/A',{}).get('/S')) for p in d.pages for a in p.get('/Annots',[])]}))",pdfPath],{encoding:'utf8'}));
  assert.match(pdf.text,/NOTE_LONG_END/); for(let i=0;i<450;i++) assert.equal((pdf.text.match(new RegExp('\\bflow'+i+'\\b','g'))||[]).length,1,'flow'+i+' appears exactly once');
  assert.ok(pdf.links.filter(link=>link==='/GoTo').length>=2,'owner/body return PDF links');
  assert.deepEqual(errors,[]);
  console.log('PASS actual rich endnote DOCX import, canonical ownership, flat projection, native export and identity reopen'); console.log('Artifacts: '+dir);
 } catch(error){console.error('Artifacts: '+dir);throw error;} finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
