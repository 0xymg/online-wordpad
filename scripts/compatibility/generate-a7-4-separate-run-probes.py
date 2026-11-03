#!/usr/bin/env python3
"""Word-only separate run separator baseline controls."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[2]/'fixtures/compatibility'; out=root/'a7-4-note-run-probes'; out.mkdir(exist_ok=True)
if list(out.glob('*.word.pdf')): raise SystemExit('Captured Word references freeze this directory')
source=root/'notes.docx'; cases=[]
for size in [11,16]:
 name=f'separate-run-{size}'; target=out/(name+'.docx')
 with zipfile.ZipFile(source) as src,zipfile.ZipFile(target,'w') as dst:
  for info in src.infolist():
   data=src.read(info.filename)
   if info.filename=='word/styles.xml':data=data.decode().replace('w:val="22"',f'w:val="{size*2}"').encode()
   if info.filename in ('word/endnotes.xml','word/footnotes.xml'):
    s=data.decode(); assert s.count('<w:separator/></w:r>')==1
    data=s.replace('<w:separator/></w:r>','<w:separator/></w:r><w:r><w:t>SEP_BASELINE</w:t></w:r>').encode()
   dst.writestr(info,data)
 cases.append({'id':name,'source':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'normal_size_pt':size,'word_only_unsupported_separator_marker':True,'word_reference_status':'PENDING'})
(out/'manifest.json').write_text(json.dumps({'schema_version':1,'source':'../notes.docx','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'cases':cases},indent=2)+'\n')
