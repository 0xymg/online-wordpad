#!/usr/bin/env python3
"""Create held-out 12pt column and changed-main-content native note controls."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[2]/'fixtures/compatibility'
source=ROOT/'notes.docx'; out=ROOT/'a7-5-note-probes'; out.mkdir(exist_ok=True)
if list(out.glob('*.word.pdf')): raise SystemExit('Word references freeze these sources')
cases=[]
for name,columns,shift in [('columns-base-12',2,False),('shifted-base-12',1,True)]:
 target=out/(name+'.docx')
 with zipfile.ZipFile(source) as src,zipfile.ZipFile(target,'w') as dst:
  for info in src.infolist():
   data=src.read(info.filename)
   if info.filename=='word/styles.xml': data=data.decode().replace('w:val="22"','w:val="24"').encode()
   if info.filename=='word/document.xml':
    s=data.decode()
    if columns==2:
     assert s.count('<w:cols w:space="720"/>')==1
     s=s.replace('<w:cols w:space="720"/>','<w:cols w:space="720" w:num="2"/>')
    if shift:
     extra='<w:p><w:r><w:t>HELD_OUT_PRECEDING_CONTENT A changed main-story paragraph moves the endnote separator independently of the bottom-anchored footnote.</w:t></w:r></w:p>'
     assert s.count('<w:sectPr ')==1
     s=s.replace('<w:sectPr ',extra+'<w:sectPr ')
    data=s.encode()
   dst.writestr(info,data)
 cases.append({'id':name,'source':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'normal_size_pt':12,'columns':columns,'changed_preceding_main_content':shift,'markers':['FOOTNOTE_BODY','ENDNOTE_BODY'],'word_reference_status':'PENDING'})
(out/'manifest.json').write_text(json.dumps({'schema_version':1,'source':'../notes.docx','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'description':'Held-out A7.5 controls generated after the shared half-point calibration: 12pt two-column and independent changed preceding main-story content. Frozen A7.4 originals untouched.','cases':cases},indent=2)+'\n')
print(out/'manifest.json')
