/* eslint-disable @typescript-eslint/no-require-imports */
/** Additive A3 omitted-space probe. Never rewrites the frozen four-source corpus. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { Document, Packer, Paragraph, TextRun, ColumnBreak, SectionType, LineRuleType } = require('docx');
const OUT = path.resolve(__dirname, '../../fixtures/columns/defaults');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FIXED = new Date('2020-01-01T00:00:00Z');
const cases = [{ id: 'OMITTED', space: null }, { id: 'ZERO', space: 0 }, { id: 'EXPLICIT720', space: 720 }];
const markers = cases.flatMap(item => [`${item.id}_LEFT`, `${item.id}_RIGHT`]);
const all = (node, name) => Array.from(node.getElementsByTagNameNS(W, name));
const elements = node => Array.from(node.childNodes || []).filter(child => child.nodeType === 1);
const own = (node, name) => elements(node).find(child => child.namespaceURI === W && child.localName === name);
const xml = value => new DOMParser({ onError(level, message) { if (level === 'error' || level === 'fatalError') throw new Error(message); } }).parseFromString(value, 'application/xml');
const serialize = node => new XMLSerializer().serializeToString(node);
const run = value => new TextRun({ text: value, font: 'Arial', size: 22 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
(async () => {
  const existing = await fs.readdir(OUT).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  assert.ok(!existing.some(name => name.endsWith('.pdf')), 'Captured default reference freezes this source');
  const doc = new Document({ creator: 'EDTRDocs synthetic column default probe', title: 'column-space-defaults',
    styles: { default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.EXACT } } } } },
    sections: cases.map(item => ({ properties: { type: SectionType.NEXT_PAGE, page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 } } },
      children: [new Paragraph({ spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.EXACT }, widowControl: false,
        children: [run(`${item.id}_LEFT`), new ColumnBreak(), run(`${item.id}_RIGHT`)] })] })) });
  const packed = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const main = xml(await packed.file('word/document.xml').async('string')), body = all(main, 'body')[0];
  for (const p of [...elements(body)]) if (p.localName === 'p' && own(own(p, 'pPr') || p, 'sectPr') && !all(p, 't').length && !all(p, 'br').length) {
    const previous = elements(body).slice(0, elements(body).indexOf(p)).at(-1); assert.equal(previous?.localName, 'p');
    let properties = own(previous, 'pPr'); if (!properties) { properties = main.createElementNS(W, 'w:pPr'); previous.insertBefore(properties, previous.firstChild); }
    properties.appendChild(own(own(p, 'pPr'), 'sectPr')); body.removeChild(p);
  }
  assert.equal(all(main, 'sectPr').length, 3);
  all(main, 'sectPr').forEach((section, index) => {
    for (const old of [...elements(section)]) if (old.localName === 'cols') section.removeChild(old);
    const cols = main.createElementNS(W, 'w:cols');
    for (const [key, value] of Object.entries({ num: 2, equalWidth: 1, sep: 0, ...(cases[index].space === null ? {} : { space: cases[index].space }) })) cols.setAttributeNS(W, 'w:' + key, String(value));
    section.appendChild(cols);
    const order = ['type', 'pgSz', 'pgMar', 'cols', 'docGrid'];
    elements(section).sort((a, b) => order.indexOf(a.localName) - order.indexOf(b.localName)).forEach(child => section.appendChild(child));
    assert.equal(cols.hasAttributeNS(W, 'space'), cases[index].space !== null);
    if (cases[index].space !== null) assert.equal(cols.getAttributeNS(W, 'space'), String(cases[index].space));
    assert.equal(cols.getAttributeNS(W, 'num'), '2'); assert.equal(cols.getAttributeNS(W, 'equalWidth'), '1');
    assert.equal(own(section, 'pgSz').getAttributeNS(W, 'w'), '12240'); assert.equal(own(section, 'pgSz').getAttributeNS(W, 'h'), '15840');
    for (const side of ['top', 'right', 'bottom', 'left']) assert.equal(own(section, 'pgMar').getAttributeNS(W, side), '1440');
  });
  assert.equal(all(main, 'br').length, 3); for (const br of all(main, 'br')) assert.equal(br.getAttributeNS(W, 'type'), 'column');
  const text = all(main, 't').map(el => el.textContent).join(' '); for (const marker of markers) assert.equal(text.split(marker).length - 1, 1);
  packed.file('word/document.xml', serialize(main));
  const styles = xml(await packed.file('word/styles.xml').async('string'));
  for (const fonts of all(styles, 'rFonts')) {
    for (const attr of [...Array.from(fonts.attributes)]) if (/Theme$/i.test(attr.localName)) fonts.removeAttributeNode(attr);
    for (const script of ['ascii', 'hAnsi', 'eastAsia', 'cs']) fonts.setAttributeNS(W, 'w:' + script, 'Arial');
  }
  packed.file('word/styles.xml', serialize(styles));
  packed.file('docProps/core.xml', (await packed.file('docProps/core.xml').async('string')).replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g, '$12020-01-01T00:00:00.000Z$2'));
  const canonical = new JSZip(); for (const name of Object.keys(packed.files).filter(name => !packed.files[name].dir).sort()) canonical.file(name, await packed.file(name).async('uint8array'), { date: FIXED, createFolders: false, unixPermissions: 0o100600 });
  const bytes = await canonical.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  await fs.mkdir(OUT, { recursive: true }); await fs.writeFile(path.join(OUT, 'column-space-defaults.docx'), bytes);
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ schema_version: 1, id: 'column-space-defaults', source_sha256: hash(bytes), generator: 'scripts/compatibility/generate-column-defaults.cjs',
    sections: cases.map(item => ({ marker_prefix: item.id, num: 2, equalWidth: true, separator: false, space: item.space === null ? 'OMITTED' : item.space })),
    page_twips: { width: 12240, height: 15840 }, margins_twips: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, font: 'Arial 11pt (declared)', line_twips: 280, markers_once: markers,
    question: 'Which explicit gap, if either, matches the omitted w:space second-column anchor in actual Word? Expected explicit right x is 306pt for 0 and 324pt for 720, plus shared glyph rounding.',
    word_reference: { status: 'PENDING' } }, null, 2) + '\n');
  console.log('PASS generated source-validated fixtures/columns/defaults/column-space-defaults.docx');
})().catch(error => { console.error(error); process.exitCode = 1; });
