#!/usr/bin/env python3
"""Generate synthetic, deterministic Word compatibility fixtures."""
from pathlib import Path
from datetime import datetime
from hashlib import sha256
import json, zipfile, io
from docx import Document
from docx.enum.section import WD_SECTION, WD_ORIENT
from docx.shared import Inches, Pt
from docx.enum.text import WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'fixtures' / 'compatibility'
OUT.mkdir(parents=True, exist_ok=True)
manifest = {'schema_version': 1, 'generator': 'scripts/compatibility/generate.py', 'fixtures': []}

def new_document():
    d = Document()
    d.core_properties.author = 'EDTRDocs compatibility fixtures'
    d.core_properties.last_modified_by = 'EDTRDocs compatibility fixtures'
    d.core_properties.created = datetime(2020, 1, 1)
    d.core_properties.modified = datetime(2020, 1, 1)
    for name in ['Normal','Title','Subtitle'] + [f'Heading {i}' for i in range(1, 10)]:
        style = d.styles[name]; style.font.name = 'Arial'
        fonts = style.element.get_or_add_rPr().get_or_add_rFonts()
        for script in ('ascii','hAnsi','eastAsia','cs'): fonts.set(qn('w:'+script),'Arial')
        for theme in ('asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme','csTheme'):
            fonts.attrib.pop(qn('w:'+theme), None)
    defaults=d.styles.element.find(qn('w:docDefaults'))
    rpr=defaults.find(qn('w:rPrDefault')).find(qn('w:rPr'))
    fonts=rpr.find(qn('w:rFonts'))
    if fonts is None: fonts=OxmlElement('w:rFonts'); rpr.insert(0, fonts)
    for script in ('ascii','hAnsi','eastAsia','cs'): fonts.set(qn('w:'+script),'Arial')
    for theme in ('asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme','csTheme'):
        fonts.attrib.pop(qn('w:'+theme), None)
    d.styles['Normal'].font.size = Pt(11)
    return d

def save(name, doc, facts, extra_parts=None):
    stream = io.BytesIO(); doc.save(stream); stream.seek(0)
    path = OUT / f'{name}.docx'
    # Canonical ZIP ordering and timestamps make identical input byte-identical.
    with zipfile.ZipFile(stream) as source:
        parts = {item.filename: source.read(item.filename) for item in source.infolist()}
    if extra_parts: parts = extra_parts(parts)
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for filename in sorted(parts):
            info = zipfile.ZipInfo(filename, (2020, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o600 << 16
            target.writestr(info, parts[filename])
    manifest['fixtures'].append({'id': name, 'source': f'{name}.docx', 'sha256': sha256(path.read_bytes()).hexdigest(), 'expected': facts})

def basic():
    d = new_document(); sec = d.sections[0]; sec.page_width = Inches(8.5); sec.page_height = Inches(11)
    for side in ('left_margin','right_margin','top_margin','bottom_margin'): setattr(sec, side, Inches(1))
    d.add_heading('Basic section fixture', 0)
    d.add_paragraph('BASIC_START The first paragraph is a stable text anchor.')
    d.add_paragraph('BASIC_END The last paragraph completes the baseline.')
    save('basic',d,{'sections':1,'page_sizes_twips':[[12240,15840]],'tokens_once':['BASIC_START','BASIC_END'],'features':['single_section']})

def sections():
    d = new_document(); a=d.sections[0]; a.page_width=Inches(8.5); a.page_height=Inches(11); a.left_margin=Inches(1); a.right_margin=Inches(1); a.header.paragraphs[0].text='LINKED_HEADER'
    d.add_heading('Mixed section fixture',0); d.add_paragraph('SECTION_ONE portrait letter with a linked header.')
    b=d.add_section(WD_SECTION.NEW_PAGE); b.orientation=WD_ORIENT.LANDSCAPE; b.page_width=Inches(11.69); b.page_height=Inches(8.27); b.left_margin=Inches(1.25); b.right_margin=Inches(.75)
    d.add_paragraph('SECTION_TWO landscape A4 inherits its header.')
    c=d.add_section(WD_SECTION.NEW_PAGE); c.orientation=WD_ORIENT.PORTRAIT; c.page_width=Inches(8.27); c.page_height=Inches(11.69); c.header.is_linked_to_previous=False; c.header.paragraphs[0].text='INDEPENDENT_HEADER'
    d.add_paragraph('SECTION_THREE portrait A4 has an independent header.')
    save('mixed-sections',d,{'sections':3,'page_sizes_twips':[[12240,15840],[16834,11909],[11909,16834]],'tokens_once':['SECTION_ONE','SECTION_TWO','SECTION_THREE'],'features':['mixed_page_sizes','mixed_orientation','linked_header','independent_header']})

def tabs(d, narrow=False):
    d.add_heading('Tab alignment and leaders', 0)
    p=d.add_paragraph(); stops=p.paragraph_format.tab_stops
    stops.add_tab_stop(Inches(1.1 if narrow else 2), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    stops.add_tab_stop(Inches(1.7 if narrow else 4), WD_TAB_ALIGNMENT.DECIMAL, WD_TAB_LEADER.DASHES)
    p.add_run('TABS_START\t42\t12.75 TABS_END')

def column_section(section):
    cols=section._sectPr.find(qn('w:cols')); cols.set(qn('w:num'),'2'); cols.set(qn('w:space'),'720'); cols.set(qn('w:sep'),'1')

def columns(d, include_table=False):
    column_section(d.sections[0]); d.add_heading('Two column fixture', 0)
    for i in range(26): d.add_paragraph(f'COLUMN_{i:02d} This paragraph supplies predictable text in a two column section.')
    if include_table:
        table=d.add_table(rows=2,cols=2); table.style='Table Grid'; table.autofit=False
        for col in table.columns: col.width=Inches(1.2)
        for row in table.rows:
            for cell in row.cells: cell.width=Inches(1.2)
        for i,text in enumerate(('TABLE_A','TABLE_B','TABLE_C','TABLE_D')): table.cell(i//2,i%2).text=text

def add_note_ref(p, kind, note_id):
    run=p.add_run(); ref=OxmlElement('w:'+kind+'Reference'); ref.set(qn('w:id'),str(note_id)); run._r.append(ref)

def note_parts(parts):
    ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    relns='http://schemas.openxmlformats.org/package/2006/relationships'
    ctns='http://schemas.openxmlformats.org/package/2006/content-types'
    rels=etree.fromstring(parts['word/_rels/document.xml.rels']); types=etree.fromstring(parts['[Content_Types].xml'])
    for kind in ('footnote','endnote'):
        plural=kind+'s'; root=etree.Element('{%s}%s'%(ns,plural), nsmap={'w':ns})
        for number,text in ((-1,None),(0,None),(1,kind.upper()+'_BODY')):
            item=etree.SubElement(root,'{%s}%s'%(ns,kind)); item.set('{%s}id'%ns,str(number))
            if number<1: item.set('{%s}type'%ns,'separator' if number==-1 else 'continuationSeparator')
            p=etree.SubElement(item,'{%s}p'%ns); r=etree.SubElement(p,'{%s}r'%ns)
            if text: etree.SubElement(r,'{%s}t'%ns).text=text
            else: etree.SubElement(r,'{%s}%s'%(ns,'separator' if number==-1 else 'continuationSeparator'))
        parts['word/'+plural+'.xml']=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
        rel=etree.SubElement(rels,'{%s}Relationship'%relns); rel.set('Id','rIdFixture'+plural); rel.set('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/'+plural); rel.set('Target',plural+'.xml')
        override=etree.SubElement(types,'{%s}Override'%ctns); override.set('PartName','/word/'+plural+'.xml'); override.set('ContentType','application/vnd.openxmlformats-officedocument.wordprocessingml.'+plural+'+xml')
    parts['word/_rels/document.xml.rels']=etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)
    parts['[Content_Types].xml']=etree.tostring(types,xml_declaration=True,encoding='UTF-8',standalone=True)
    return parts

def notes(d):
    d.add_heading('Note references',0); p=d.add_paragraph('NOTE_ANCHOR Footnote'); add_note_ref(p,'footnote',1); p.add_run(' and endnote'); add_note_ref(p,'endnote',1); p.add_run('.')

def field(p,instruction,result):
    run=p.add_run(); begin=OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'),'begin'); run._r.append(begin)
    run=p.add_run(); instr=OxmlElement('w:instrText'); instr.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); instr.text=' '+instruction+' '; run._r.append(instr)
    run=p.add_run(); sep=OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'),'separate'); run._r.append(sep)
    p.add_run(result); end=OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'),'end'); p.add_run()._r.append(end)

def references(d):
    d.add_heading('Contents and reference fields',0); p=d.add_paragraph(); field(p,'TOC \\o "1-3" \\h','TARGET_HEADING\t1')
    p=d.add_heading('TARGET_HEADING',level=1); start=OxmlElement('w:bookmarkStart'); start.set(qn('w:id'),'42'); start.set(qn('w:name'),'FixtureTarget'); p._p.insert(0,start)
    end=OxmlElement('w:bookmarkEnd'); end.set(qn('w:id'),'42'); p._p.append(end)
    p=d.add_paragraph('CROSSREF_START '); field(p,'REF FixtureTarget \\h','TARGET_HEADING'); p.add_run(' CROSSREF_END')

basic(); sections()
d=new_document(); tabs(d); save('tabs-leaders',d,{'tokens_once':['TABS_START','TABS_END'],'features':['right_tab','decimal_tab','dot_leader','dash_leader']})
d=new_document(); columns(d); save('columns',d,{'tokens_once':['COLUMN_00','COLUMN_25'],'features':['two_equal_columns','column_separator']})
d=new_document(); columns(d,True); save('table-columns',d,{'tokens_once':['TABLE_A','TABLE_B','TABLE_C','TABLE_D'],'features':['two_equal_columns','table']})
d=new_document(); notes(d); save('notes',d,{'tokens_once':['NOTE_ANCHOR','FOOTNOTE_BODY','ENDNOTE_BODY'],'features':['footnote','endnote']},note_parts)
d=new_document(); references(d); save('crossrefs-toc',d,{'tokens_once':['CROSSREF_START','CROSSREF_END'],'features':['bookmark','cross_reference_field','toc_field']})
d=new_document(); tabs(d,True); columns(d,True); notes(d); references(d); save('mixed',d,{'tokens_once':['TABS_START','TABS_END','COLUMN_00','COLUMN_25','TABLE_A','TABLE_B','TABLE_C','TABLE_D','NOTE_ANCHOR','FOOTNOTE_BODY','ENDNOTE_BODY','CROSSREF_START','CROSSREF_END'],'features':['tabs','leaders','two_equal_columns','table','footnote','endnote','bookmark','cross_reference_field','toc_field']},note_parts)
(OUT / 'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
