#!/usr/bin/env python3
"""Semantic navigation regression on the frozen corpus, independent of Word's
viewport/zoom choices and stale cached TOC. The raw comparison stays unchanged.
"""
import argparse, hashlib, json, re
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

parser=argparse.ArgumentParser()
parser.add_argument('--app',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
rows=[]
for case,count in [('notes',2),('crossrefs-toc',3),('mixed',5)]:
    source=args.app/(case+'.pdf');reader=PdfReader(source)
    with pdfplumber.open(source) as doc:
        targets={}
        for page_no,page in enumerate(doc.pages,1):
            for marker in ['FOOTNOTE_BODY','ENDNOTE_BODY','TARGET_HEADING']:
                for hit in page.search(marker):
                    if marker=='TARGET_HEADING' and not any(abs(c['size']-14)<.01 for c in hit['chars']):continue
                    assert marker not in targets,(case,marker,'ambiguous target')
                    targets[marker]={'page':page_no,'x':hit['x0'],'top':hit['top'],'bottom':hit['bottom']}
        links=[]
        for page in reader.pages:
            for ref in page.get('/Annots',[]):
                a=ref.get_object()
                if a.get('/Subtype')!='/Link':continue
                action=a['/A'];assert action['/S']=='/GoTo'
                d=action['/D'];p=reader.get_page_number(d[0].get_object())+1
                links.append({'page':p,'fit':str(d[1]),'x':float(d[2]),'top':float(reader.pages[p-1].mediabox.height)-float(d[3]),'zoom':float(d[4])})
        assert len(links)==count,(case,'link count',len(links))
        expected=(['FOOTNOTE_BODY','ENDNOTE_BODY'] if case!='crossrefs-toc' else [])+(['TARGET_HEADING']*3 if case!='notes' else [])
        for link,marker in zip(links,expected):
            t=targets[marker]
            assert link['page']==t['page'],(case,marker,'wrong physical page')
            assert abs(link['x']-t['x'])<1,(case,marker,'wrong horizontal target',link,t)
            assert t['top']-6 <= link['top'] <= t['bottom'],(case,marker,'destination does not reveal target line',link,t)
            assert link['fit']=='/XYZ' and link['zoom']==0
        if case=='mixed':
            # Current target really is page two. Word's original source has a
            # stale cached one; do not alter the app to reproduce that cache.
            text=' '.join(p.extract_text() or '' for p in reader.pages)
            assert targets['TARGET_HEADING']['page']==2
            assert re.search(r'TARGET_HEADING\s+2\b',text),(case,'current TOC page result missing')
        rows.append({'case':case,'status':'PASS','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'targets':targets,'links':links})
args.output.write_text(json.dumps({'schema_version':1,'purpose':'semantic physical-target visibility; does not replace raw Word viewport/link-count comparisons','cases':rows},indent=2)+'\n')
print('PASS notes/crossrefs/mixed: all 10 internal links reveal the correct visible target on its physical page; live TOC keeps current page two.')
