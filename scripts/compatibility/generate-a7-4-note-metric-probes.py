#!/usr/bin/env python3
"""Generate additional independent Word metric controls from frozen originals."""
from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).resolve().parents[2]/'fixtures/compatibility'; out=root/'a7-4-note-metric-probes'; out.mkdir(exist_ok=True)
if list(out.glob('*.word.pdf')): raise SystemExit('Captured Word evidence freezes this directory')
cases=[]
for name,size,control in [('base-12',24,False),('base-20',40,False),('baseline-11',22,True),('baseline-16',32,True)]:
 source=root/'notes.docx'; target=out/(name+'.docx')
 with zipfile.ZipFile(source) as src,zipfile.ZipFile(target,'w') as dst:
  for info in src.infolist():
   data=src.read(info.filename)
   if info.filename=='word/styles.xml': data=data.decode().replace('w:val="22"',f'w:val="{size}"').encode()
   if control and info.filename in ('word/endnotes.xml','word/footnotes.xml'):
    s=data.decode(); assert s.count('<w:separator/>')==1
    data=s.replace('<w:separator/>','<w:separator/><w:t>SEP_BASELINE</w:t>').encode()
   dst.writestr(info,data)
 cases.append({'id':name,'source':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'normal_size_pt':size/2,'word_only_unsupported_separator_marker':control,'word_reference_status':'PENDING'})
(out/'manifest.json').write_text(json.dumps({'schema_version':1,'source':'../notes.docx','source_sha256':hashlib.sha256((root/'notes.docx').read_bytes()).hexdigest(),'cases':cases},indent=2)+'\n')
