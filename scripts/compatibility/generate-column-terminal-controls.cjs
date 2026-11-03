/* eslint-disable @typescript-eslint/no-require-imports */
/** Additive terminal-break probes. Captured PDF freezes all three source documents. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { Document, Packer, Paragraph, TextRun, ColumnBreak, PageBreak, LineRuleType } = require('docx');
const OUT = path.resolve(__dirname, '../../fixtures/columns/terminal-controls');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FIXED = new Date('2020-01-01T00:00:00Z');
const cases = [
  { id: 'terminal-one-column-break', count: 1, sequence: ['ONE_COLUMN_TEXT', 'column'] },
  { id: 'terminal-two-column-break', count: 2, sequence: ['TWO_FIRST', 'column', 'TWO_SECOND', 'column'] },
  { id: 'terminal-one-page-break', count: 1, sequence: ['ONE_PAGE_TEXT', 'page'] },
];
const xml = value => new DOMParser({ onError(level, message) { if (level === 'error' || level === 'fatalError') throw new Error(message); } }).parseFromString(value, 'application/xml');
const all = (node, name) => Array.from(node.getElementsByTagNameNS(W, name));
const elements = node => Array.from(node.childNodes || []).filter(child => child.nodeType === 1);
const own = (node, name) => elements(node).find(child => child.namespaceURI === W && child.localName === name);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const serialize = node => new XMLSerializer().serializeToString(node);
(async () => {
 const existing = await fs.readdir(OUT).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
 assert.ok(!existing.some(name => name.endsWith('.pdf')), 'Captured terminal reference freezes these sources');
 const records = [];
 for (const item of cases) {
  const children = item.sequence.map(value => value === 'column' ? new ColumnBreak() : value === 'page' ? new PageBreak() : new TextRun({text:value,font:'Arial',size:22}));
  const document = new Document({creator:'EDTRDocs synthetic terminal break probes',title:item.id,
   styles:{default:{document:{run:{font:'Arial',size:22},paragraph:{spacing:{before:0,after:0,line:280,lineRule:LineRuleType.EXACT}}}}},
   sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440,header:720,footer:720}}},
    children:[new Paragraph({spacing:{before:0,after:0,line:280,lineRule:LineRuleType.EXACT},widowControl:false,children})]}]});
  const packed=await JSZip.loadAsync(await Packer.toBuffer(document));
  const main=xml(await packed.file('word/document.xml').async('string')),body=all(main,'body')[0];
  const bodyElements=elements(body);assert.equal(bodyElements.length,2);assert.equal(bodyElements[0].localName,'p');assert.equal(bodyElements[1].localName,'sectPr');
  const paragraph=bodyElements[0],section=bodyElements[1];assert.equal(all(main,'sectPr').length,1);assert.equal(all(paragraph,'sectPr').length,0);
  for(const old of elements(section).filter(el=>el.localName==='cols'))section.removeChild(old);
  const cols=main.createElementNS(W,'w:cols');for(const [key,value] of Object.entries({num:item.count,space:720,equalWidth:1,sep:0}))cols.setAttributeNS(W,'w:'+key,String(value));
  const grid=own(section,'docGrid');section.insertBefore(cols,grid||null);
  assert.equal(own(section,'pgSz').getAttributeNS(W,'w'),'12240');assert.equal(own(section,'pgSz').getAttributeNS(W,'h'),'15840');
  for(const side of ['top','right','bottom','left'])assert.equal(own(section,'pgMar').getAttributeNS(W,side),'1440');
  const spacing=own(own(paragraph,'pPr'),'spacing');assert.equal(spacing.getAttributeNS(W,'line'),'280');assert.equal(spacing.getAttributeNS(W,'lineRule'),'exact');
  const sequence=[];for(const run of elements(paragraph).filter(el=>el.localName==='r'))for(const child of elements(run)){if(child.localName==='t')sequence.push(child.textContent);if(child.localName==='br')sequence.push(child.getAttributeNS(W,'type'));}
  assert.deepEqual(sequence,item.sequence);assert.ok(['column','page'].includes(sequence.at(-1)),'the final inline item must be the break');
  assert.equal(all(main,'br').length,item.sequence.filter(value=>value==='column'||value==='page').length);
  assert.equal(all(main,'t').length,item.sequence.filter(value=>value!=='column'&&value!=='page').length);
  packed.file('word/document.xml',serialize(main));
  const styles=xml(await packed.file('word/styles.xml').async('string'));for(const fonts of all(styles,'rFonts')){for(const a of Array.from(fonts.attributes))if(/Theme$/i.test(a.localName))fonts.removeAttributeNode(a);for(const script of ['ascii','hAnsi','eastAsia','cs'])fonts.setAttributeNS(W,'w:'+script,'Arial');}packed.file('word/styles.xml',serialize(styles));
  packed.file('docProps/core.xml',(await packed.file('docProps/core.xml').async('string')).replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g,'$12020-01-01T00:00:00.000Z$2'));
  const canonical=new JSZip();for(const name of Object.keys(packed.files).filter(name=>!packed.files[name].dir).sort())canonical.file(name,await packed.file(name).async('uint8array'),{date:FIXED,createFolders:false,unixPermissions:0o100600});
  const bytes=await canonical.generateAsync({type:'nodebuffer',platform:'UNIX',compression:'DEFLATE',compressionOptions:{level:9}});
  await fs.mkdir(OUT,{recursive:true});await fs.writeFile(path.join(OUT,item.id+'.docx'),bytes);
  records.push({id:item.id,source:item.id+'.docx',source_sha256:hash(bytes),column_count:item.count,sequence:item.sequence,word_reference:{status:'PENDING'}});
 }
 await fs.writeFile(path.join(OUT,'manifest.json'),JSON.stringify({schema_version:1,generator:'scripts/compatibility/generate-column-terminal-controls.cjs',page_twips:{width:12240,height:15840},margins_twips:{top:1440,right:1440,bottom:1440,left:1440},font:'Arial 11pt (declared)',line_twips:280,question:'Does a terminal column or page break create a blank final physical page?',cases:records},null,2)+'\n');
 console.log('PASS three separate terminal break DOCX sources structurally verified');
})().catch(error=>{console.error(error);process.exitCode=1});
