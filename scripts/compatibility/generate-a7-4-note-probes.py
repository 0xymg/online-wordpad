#!/usr/bin/env python3
"""Build frozen-source-derived probes; never overwrite Word evidence."""
import hashlib, json, re, zipfile
from pathlib import Path
root = Path(__file__).resolve().parents[2]
source = root / 'fixtures/compatibility/notes.docx'
out = root / 'fixtures/compatibility/a7-4-note-probes'
out.mkdir(exist_ok=True)
if list(out.glob('*.word.pdf')):
    raise SystemExit('Word references freeze this corpus; use a new directory')
cases = []
for name, size, explicit, columns in [
    ('base-11', 22, False, 1), ('zero-11', 22, True, 1),
    ('base-16', 32, False, 1), ('zero-16', 32, True, 1),
    ('columns-base-11', 22, False, 2), ('columns-zero-11', 22, True, 2),
]:
    target = out / (name + '.docx')
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(target, 'w') as dst:
        for info in src.infolist():
            data = src.read(info.filename)
            if info.filename == 'word/styles.xml':
                s = data.decode()
                s = s.replace('w:val="22"', f'w:val="{size}"')
                data = s.encode()
            if info.filename in ('word/endnotes.xml', 'word/footnotes.xml') and explicit:
                s = data.decode()
                s = re.sub(r'(<w:(?:endnote|footnote) w:id="-1" w:type="separator"><w:p>)', r'\1<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>', s)
                data = s.encode()
            if info.filename == 'word/document.xml' and columns == 2:
                s = data.decode()
                s, n = re.subn(r'<w:cols([^>]*)/>', r'<w:cols\1 w:num="2"/>', s)
                if n != 1: raise RuntimeError('Unexpected section column structure')
                data = s.encode()
            dst.writestr(info, data)
    cases.append({'id':name,'source':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'normal_size_pt':size/2,'separator_spacing':'single-zero' if explicit else 'inherited','columns':columns,'markers':['FOOTNOTE_BODY','ENDNOTE_BODY'],'word_reference_status':'PENDING'})
manifest={'schema_version':1,'source':'../notes.docx','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'description':'Independent native separator spacing, Normal font size, and column probes; Word reference capture pending. No output is a Word reference until captured from Word.','cases':cases}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(out/'manifest.json')
