/* eslint-disable @typescript-eslint/no-require-imports */
/** A3 synthetic sources only. Never writes A0 fixtures or Word/app references. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { Document, Packer, Paragraph, TextRun, ColumnBreak, PageBreak, SectionType, LineRuleType } = require('docx');

const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'fixtures/columns');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FIXED = new Date('2020-01-01T00:00:00Z');
const PAGE = { width: 12240, height: 15840 }, MARGINS = { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 };
const elements = node => Array.from(node.childNodes || []).filter(child => child.nodeType === 1);
const all = (node, name) => Array.from(node.getElementsByTagNameNS(W, name));
const own = (node, name) => elements(node).find(child => child.namespaceURI === W && child.localName === name);
const val = (node, key) => node?.getAttributeNS(W, key) || null;
const xml = text => new DOMParser({ onError(level, message) { if (level === 'error' || level === 'fatalError') throw new Error(message); } }).parseFromString(text, 'application/xml');
const serialize = node => new XMLSerializer().serializeToString(node);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const text = (value, extra = {}) => new TextRun({ text: value, font: 'Arial', size: 22, ...extra });
const paragraph = (content, extra = {}) => new Paragraph({ style: 'Normal', spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.EXACT }, widowControl: false, keepNext: false, ...extra,
  children: typeof content === 'string' ? [text(content)] : content });
const rows = (prefix, count, suffix = ' fixed row') => Array.from({ length: count }, (_, index) => paragraph(`${prefix}_${String(index).padStart(3, '0')}${suffix}`));
const columns = (count, space = 720, separator = false, extra = {}) => ({ num: count, space, equalWidth: true, separator, ...extra });
const section = (children, config) => ({ children, config });
const configs = [];

function widths() {
  const long = ['WIDTH2_BEGIN', ...Array.from({ length: 420 }, (_, i) => `WIDTH2_${String(i).padStart(4, '0')}`), 'WIDTH2_END'].join(' ');
  return {
    id: 'column-widths-balance',
    sections: [
      section([paragraph('DEFAULT_COLS_BEGIN native cols element absent'), ...rows('DEFAULT_ROW', 3), paragraph('DEFAULT_COLS_END')], { columns: null, start: 'nextPage' }),
      section([paragraph('EXPLICIT_ONE_BEGIN explicit single column'), ...rows('ONE_ROW', 3), paragraph('EXPLICIT_ONE_END')], { columns: columns(1), start: 'nextPage' }),
      section([paragraph(long)], { columns: columns(2, 720, true), start: 'nextPage' }),
      section([paragraph('SHORT_THREE_BEGIN short final region'), ...rows('BALANCE3', 12), paragraph('SHORT_THREE_END')], { columns: columns(3, 360, true), start: 'nextPage' }),
    ],
    markers: ['DEFAULT_COLS_BEGIN', 'DEFAULT_COLS_END', 'EXPLICIT_ONE_BEGIN', 'EXPLICIT_ONE_END', 'WIDTH2_BEGIN', 'WIDTH2_END', 'WIDTH2_0000', 'WIDTH2_0419', 'SHORT_THREE_BEGIN', 'SHORT_THREE_END'],
    families: [{ prefix: 'WIDTH2_', digits: 4, count: 420 }, { prefix: 'BALANCE3_', digits: 3, count: 12 }],
    questions: ['How does absent w:cols compare with explicit count=1?', 'What are the actual column left/right edges for 2/3 equal columns and their explicit gaps/separators?', 'Where does one long paragraph cross columns and physical pages?', 'How are the short final section and the long section final page balanced?'],
  };
}
function continuous() {
  const cases = [['CONT1_A', 1, 4], ['CONT2_B', 2, 12], ['CONT1_C', 1, 3], ['CONT2_D', 2, 10], ['CONT3_E', 3, 12]];
  return {
    id: 'continuous-column-changes',
    sections: cases.map(([prefix, count, countRows], index) => section([paragraph(`${prefix}_BEGIN`), ...rows(prefix, countRows), paragraph(`${prefix}_END`)], { columns: columns(count, 720, count > 1), start: index ? 'continuous' : 'nextPage' })),
    markers: cases.flatMap(([prefix]) => [`${prefix}_BEGIN`, `${prefix}_END`]),
    families: cases.map(([prefix, , count]) => ({ prefix: prefix + '_', digits: 3, count })),
    questions: ['For same-paper continuous 1→2→1, where does each full-width band begin and end?', 'Does Word balance the preceding region before opening the next continuous region?', 'For continuous 2→3, what constrains the first baseline and last column height?', 'Which changes stay on the same physical sheet, and where is a new sheet required by available space?'],
  };
}
function breaks() {
  return {
    id: 'column-page-break-controls',
    sections: [
      section([
        paragraph([text('SINGLE_BEFORE_COLUMN'), new ColumnBreak(), text('SINGLE_AFTER_COLUMN')]),
        paragraph([text('SINGLE_BEFORE_PAGE'), new PageBreak(), text('SINGLE_AFTER_PAGE')]),
        paragraph('SINGLE_CONTROLS_END'),
      ], { columns: columns(1), start: 'nextPage' }),
      section([
        paragraph([text('TWO_BEFORE_COLUMN'), new ColumnBreak(), text('TWO_AFTER_COLUMN')]),
        paragraph([text('TWO_BEFORE_PAGE'), new PageBreak(), text('TWO_AFTER_PAGE')]),
        paragraph('TWO_BEFORE_TRAILING_COLUMN'),
        paragraph([text('TRAILING_COLUMN_TEXT'), new ColumnBreak()]),
      ], { columns: columns(2, 720, true), start: 'nextPage' }),
    ],
    markers: ['SINGLE_BEFORE_COLUMN', 'SINGLE_AFTER_COLUMN', 'SINGLE_BEFORE_PAGE', 'SINGLE_AFTER_PAGE', 'SINGLE_CONTROLS_END', 'TWO_BEFORE_COLUMN', 'TWO_AFTER_COLUMN', 'TWO_BEFORE_PAGE', 'TWO_AFTER_PAGE', 'TWO_BEFORE_TRAILING_COLUMN', 'TRAILING_COLUMN_TEXT'],
    families: [], breaks: { column: 3, page: 2, trailingType: 'column' },
    questions: ['Does a column break in one column advance to a new physical page?', 'In two columns, how does column break differ from page break within the same paragraph?', 'Does the final column break create an empty column, physical page, or another visible terminal effect?', 'Which blank sheets result from the explicit single-column/page controls rather than ordinary overflow?'],
  };
}
function rtl() {
  const field = marker => [text('نص عربي ', { rightToLeft: true }), text(marker, { rightToLeft: false }), text(' نهاية', { rightToLeft: true })];
  const content = prefix => [paragraph(`${prefix}_BEGIN`), paragraph([...field(`${prefix}_FIRST`), new ColumnBreak(), ...field(`${prefix}_SECOND`)], { bidirectional: true, spacing: { before: 0, after: 0, line: 320, lineRule: LineRuleType.EXACT } }), paragraph(`${prefix}_END`)];
  return {
    id: 'rtl-column-order',
    sections: [
      section(content('PARAGRAPH_RTL'), { columns: columns(2, 720, true), start: 'nextPage', sectionBidi: false }),
      section(content('SECTION_RTL2'), { columns: columns(2, 720, true), start: 'nextPage', sectionBidi: true }),
      section([paragraph('SECTION_RTL3_BEGIN'), paragraph([...field('SECTION_RTL3_FIRST'), new ColumnBreak(), ...field('SECTION_RTL3_SECOND'), new ColumnBreak(), ...field('SECTION_RTL3_THIRD')], { bidirectional: true, spacing: { before: 0, after: 0, line: 320, lineRule: LineRuleType.EXACT } }), paragraph('SECTION_RTL3_END')], { columns: columns(3, 720, true), start: 'nextPage', sectionBidi: true }),
    ],
    markers: ['PARAGRAPH_RTL_BEGIN', 'PARAGRAPH_RTL_FIRST', 'PARAGRAPH_RTL_SECOND', 'PARAGRAPH_RTL_END', 'SECTION_RTL2_BEGIN', 'SECTION_RTL2_FIRST', 'SECTION_RTL2_SECOND', 'SECTION_RTL2_END', 'SECTION_RTL3_BEGIN', 'SECTION_RTL3_FIRST', 'SECTION_RTL3_SECOND', 'SECTION_RTL3_THIRD', 'SECTION_RTL3_END'],
    families: [], breaks: { column: 4, page: 0 },
    questions: ['Does paragraph bidi alone change physical column order?', 'With section bidi explicitly set, which physical column contains FIRST/SECOND/THIRD?', 'Are mixed Latin marker strings readable and extractable once without reversing source order?', 'What happens to the final short region and explicit column break constraints in RTL?'],
  };
}

async function make(probe) {
  const doc = new Document({ creator: 'EDTRDocs synthetic column probes', lastModifiedBy: 'EDTRDocs synthetic column probes', title: probe.id,
    styles: { default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.EXACT } } } }, paragraphStyles: [{ id: 'Normal', name: 'Normal', run: { font: 'Arial', size: 22 }, paragraph: { spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.EXACT } } }] },
    sections: probe.sections.map(item => ({ properties: { type: SectionType.NEXT_PAGE, page: { size: PAGE, margin: MARGINS } }, children: item.children })) });
  const packed = await JSZip.loadAsync(await Packer.toBuffer(doc)), document = xml(await packed.file('word/document.xml').async('string'));
  const body = all(document, 'body')[0];
  // The library appends an empty section-terminal paragraph. Put its sectPr on
  // the preceding real paragraph so the source has no accidental empty line.
  for (const p of [...elements(body)]) if (p.localName === 'p' && own(own(p, 'pPr') || p, 'sectPr') && !all(p, 't').length && !all(p, 'br').length) {
    const previous = elements(body).slice(0, elements(body).indexOf(p)).at(-1);
    assert.equal(previous?.localName, 'p'); let props = own(previous, 'pPr');
    if (!props) { props = document.createElementNS(W, 'w:pPr'); previous.insertBefore(props, previous.firstChild); }
    props.appendChild(own(own(p, 'pPr'), 'sectPr')); body.removeChild(p);
  }
  const nativeSections = all(document, 'sectPr'); assert.equal(nativeSections.length, probe.sections.length);
  nativeSections.forEach((props, index) => {
    const config = probe.sections[index].config;
    for (const child of [...elements(props)]) if (['cols', 'bidi', 'type'].includes(child.localName)) props.removeChild(child);
    const type = document.createElementNS(W, 'w:type'); type.setAttributeNS(W, 'w:val', config.start); props.appendChild(type);
    if (config.columns) {
      const c = config.columns, cols = document.createElementNS(W, 'w:cols');
      for (const [name, value] of Object.entries({ num: c.num, space: c.space, equalWidth: '1', sep: c.separator ? '1' : '0' })) cols.setAttributeNS(W, 'w:' + name, String(value));
      props.appendChild(cols);
    }
    if (config.sectionBidi) { const bidi = document.createElementNS(W, 'w:bidi'); bidi.setAttributeNS(W, 'w:val', '1'); props.appendChild(bidi); }
    const order = ['type', 'pgSz', 'pgMar', 'cols', 'bidi', 'docGrid'];
    elements(props).map((el, i) => ({ el, i })).sort((a, b) => (order.indexOf(a.el.localName) < 0 ? 100 : order.indexOf(a.el.localName)) - (order.indexOf(b.el.localName) < 0 ? 100 : order.indexOf(b.el.localName)) || a.i - b.i).forEach(({ el }) => props.appendChild(el));
  });
  packed.file('word/document.xml', serialize(document));
  const styles = xml(await packed.file('word/styles.xml').async('string'));
  for (const fonts of all(styles, 'rFonts')) {
    for (const attr of [...Array.from(fonts.attributes)]) if (/Theme$/i.test(attr.localName)) fonts.removeAttributeNode(attr);
    for (const script of ['ascii', 'hAnsi', 'eastAsia', 'cs']) fonts.setAttributeNS(W, 'w:' + script, 'Arial');
  }
  packed.file('word/styles.xml', serialize(styles));
  const core = (await packed.file('docProps/core.xml').async('string')).replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g, '$12020-01-01T00:00:00.000Z$2');
  packed.file('docProps/core.xml', core);
  validate(probe, document, styles);
  const canonical = new JSZip();
  for (const name of Object.keys(packed.files).filter(name => !packed.files[name].dir).sort()) canonical.file(name, await packed.file(name).async('uint8array'), { date: FIXED, createFolders: false, unixPermissions: 0o100600 });
  const bytes = await canonical.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  await fs.writeFile(path.join(OUT, probe.id + '.docx'), bytes);
  return { id: probe.id, source: probe.id + '.docx', source_sha256: hash(bytes),
    source_facts: { page_twips: PAGE, margins_twips: MARGINS, font: 'Arial 11pt', normal_line_height_twips: 280,
      ...(probe.id === 'rtl-column-order' ? { rtl_field_line_height_twips: 320 } : {}),
      sections: probe.sections.map(item => item.config), markers_once: probe.markers, marker_families: probe.families, breaks: probe.breaks || null },
    questions: probe.questions, word_reference: { status: 'PENDING', page_count: null, column_coordinates: null, balance_observation: null } };
}
function validate(probe, document, styles) {
  const sections = all(document, 'sectPr'), textValue = all(document, 't').map(el => el.textContent).join(' ');
  assert.equal(sections.length, probe.sections.length);
  sections.forEach((props, index) => {
    const c = probe.sections[index].config, cols = own(props, 'cols'), size = own(props, 'pgSz'), margin = own(props, 'pgMar');
    assert.equal(val(own(props, 'type'), 'val'), c.start); assert.equal(val(size, 'w'), '12240'); assert.equal(val(size, 'h'), '15840');
    for (const key of ['top', 'right', 'bottom', 'left']) assert.equal(val(margin, key), '1440');
    if (c.columns) { for (const [key, value] of Object.entries({ num: c.columns.num, space: c.columns.space, equalWidth: 1, sep: c.columns.separator ? 1 : 0 })) assert.equal(val(cols, key), String(value)); assert.equal(all(cols, 'col').length, 0); }
    else assert.equal(cols, undefined);
    assert.equal(!!own(props, 'bidi'), !!c.sectionBidi);
  });
  for (const marker of probe.markers) assert.equal(textValue.match(new RegExp(`(?<![A-Z0-9_])${marker}(?![A-Z0-9_])`, 'g'))?.length || 0, 1, marker);
  for (const family of probe.families) { const matches = textValue.match(new RegExp(`${family.prefix}\\d{${family.digits}}(?!\\d)`, 'g')) || []; assert.equal(matches.length, family.count); assert.equal(new Set(matches).size, family.count); }
  if (probe.breaks) {
    for (const kind of ['column', 'page']) assert.equal(all(document, 'br').filter(el => val(el, 'type') === kind).length, probe.breaks[kind]);
    if (probe.breaks.trailingType) { const last = elements(all(document, 'body')[0]).filter(el => el.localName === 'p').at(-1); assert.equal(val(all(last, 'br').at(-1), 'type'), probe.breaks.trailingType); assert.equal(elements(last).at(-1).localName, 'r'); }
  }
  assert.ok(all(styles, 'rFonts').length); for (const fonts of all(styles, 'rFonts')) for (const script of ['ascii', 'hAnsi', 'eastAsia', 'cs']) assert.equal(val(fonts, script), 'Arial');
}
(async () => {
  const captured = await fs.readdir(path.join(OUT, 'references')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  if (captured.some(name => name.endsWith('.word.pdf'))) throw new Error('Captured Word references freeze this corpus. Do not regenerate its sources or reference manifest; create a new versioned probe instead.');
  await fs.mkdir(OUT, { recursive: true });
  for (const probe of [widths(), continuous(), breaks(), rtl()]) configs.push(await make(probe));
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ schema_version: 1, generator: 'scripts/compatibility/generate-column-probes.cjs', fixture_kind: 'synthetic_source_only', fixtures: configs }, null, 2) + '\n');
  console.log('PASS generated and source-validated 4 column probes: ' + configs.map(item => item.source).join(', '));
})().catch(error => { console.error(error); process.exitCode = 1; });
